// 필요한 기본 모듈 불러오기
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const dlnacasts = require('dlnacasts2');

const app = express();
const PORT = 3000;

// 미들웨어 설정
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 데이터 저장용 JSON 파일 경로
const DATA_FILE = path.join(__dirname, 'userData.json');

// 사용자 로컬 IPv4 주소 조회 (DLNA 기기에서 접근할 수 있도록 필요)
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // 외부 접속 가능한 IPv4 주소 선택
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

// 사용자 데이터 초기화 (재생 통계 및 즐겨찾기)
function loadUserData() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        } catch (e) {
            console.error('데이터 파일 읽기 오류:', e);
        }
    }
    return { playCounts: {}, favorites: [] };
}

// 사용자 데이터 저장 함수
function saveUserData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// 지원하는 로컬 오디오 확장자 목록
const SUPPORTED_EXTENSIONS = ['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac'];

// 폴더 재귀 탐색 함수
function scanDirectory(dirPath, fileList = []) {
    try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const item of items) {
            const fullPath = path.join(dirPath, item.name);
            if (item.isDirectory()) {
                if (!item.name.startsWith('.') && item.name !== 'node_modules') {
                    scanDirectory(fullPath, fileList);
                }
            } else if (item.isFile()) {
                const ext = path.extname(item.name).toLowerCase();
                if (SUPPORTED_EXTENSIONS.includes(ext)) {
                    fileList.push({
                        title: path.basename(item.name, ext),
                        fileName: item.name,
                        fullPath: fullPath,
                        type: 'local'
                    });
                }
            }
        }
    } catch (err) {
        console.warn(`폴더 읽기 오류: ${dirPath}`);
    }
    return fileList;
}

// 1. DLNA 캐스터 초기화 및 기기 검색 목록 관리
const caster = dlnacasts();
const dlnaDevices = new Map();

// 네트워크 상의 DLNA 기기(스마트 TV, 오디오 등) 감지 이벤트
caster.on('update', (player) => {
    console.log(`[DLNA] 기기 감지: ${player.name} (${player.host})`);
    dlnaDevices.set(player.name, player);
});

// 2. DLNA 검색된 기기 목록 반환 API
app.get('/api/dlna/devices', (req, res) => {
    // 현재 발견된 DLNA 렌더러 기기 이름 및 호스트 목록 추출
    const devices = Array.from(dlnaDevices.values()).map(d => ({
        name: d.name,
        host: d.host
    }));
    res.json({ devices });
});

// 3. DLNA 특정 기기로 음원 전송 및 재생 API
app.post('/api/dlna/play', (req, res) => {
    const { deviceName, trackPath, title } = req.body;
    const player = dlnaDevices.get(deviceName);

    if (!player) {
        return res.status(404).json({ error: '해당 DLNA 기기를 찾을 수 없습니다.' });
    }

    const localIp = getLocalIpAddress();
    // DLNA 기기가 스트리밍 받을 수 있는 로컬 네트워크 URL 생성
    const mediaUrl = `http://${localIp}:${PORT}/api/stream?path=${encodeURIComponent(trackPath)}`;

    console.log(`[DLNA] 전송 시작 -> ${deviceName}: ${mediaUrl}`);

    // DLNA 기기로 음원 재생 명령 전송
    player.play(mediaUrl, {
        title: title || 'Omni Music',
        type: 'audio/mp3'
    }, (err) => {
        if (err) {
            console.error('[DLNA] 재생 실패:', err);
            return res.status(500).json({ error: 'DLNA 재생 실패', detail: err.message });
        }
        res.json({ success: true, message: `${deviceName}에서 재생을 시작합니다.` });
    });
});

// 4. DLNA 재생 정지 API
app.post('/api/dlna/stop', (req, res) => {
    const { deviceName } = req.body;
    const player = dlnaDevices.get(deviceName);

    if (!player) {
        return res.status(404).json({ error: '해당 DLNA 기기를 찾을 수 없습니다.' });
    }

    player.stop((err) => {
        if (err) {
            return res.status(500).json({ error: 'DLNA 정지 실패' });
        }
        res.json({ success: true, message: `${deviceName} 재생을 중지했습니다.` });
    });
});

// 5. 기본 음악 폴더 및 특정 경로 스캔 API
app.get('/api/scan-local', (req, res) => {
    const targetDir = req.query.path || path.join(os.homedir(), 'Music');
    if (!fs.existsSync(targetDir)) {
        return res.status(404).json({ error: '경로가 존재하지 않습니다.', path: targetDir });
    }
    const files = scanDirectory(targetDir);
    res.json({ targetDir, files });
});

// 6. 로컬 음원 스트리밍 API (DLNA 기기 및 브라우저 공통 지원)
app.get('/api/stream', (req, res) => {
    const filePath = req.query.path;
    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).send('음원 파일을 찾을 수 없습니다.');
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // HTTP Range 요청 처리 (스트리밍 및 탐색 지원)
    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = (end - start) + 1;
        const fileStream = fs.createReadStream(filePath, { start, end });
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': 'audio/mpeg',
        };
        res.writeHead(206, head);
        fileStream.pipe(res);
    } else {
        const head = {
            'Content-Length': fileSize,
            'Content-Type': 'audio/mpeg',
        };
        res.writeHead(200, head);
        fs.createReadStream(filePath).pipe(res);
    }
});

// 7. 자주 듣는 음악 및 즐겨찾기 조회 API
app.get('/api/stats', (req, res) => {
    const data = loadUserData();
    res.json(data);
});

// 8. 음원 재생 시 재생 횟수 누적 API
app.post('/api/play-count', (req, res) => {
    const { id, title, type, source } = req.body;
    if (!id) return res.status(400).send('ID가 필요합니다.');

    const data = loadUserData();
    if (!data.playCounts[id]) {
        data.playCounts[id] = { id, title, type, source, count: 0 };
    }
    data.playCounts[id].count += 1;
    saveUserData(data);

    res.json({ success: true, item: data.playCounts[id] });
});

// 9. 즐겨찾기 토글 API
app.post('/api/favorites/toggle', (req, res) => {
    const { item } = req.body;
    if (!item || !item.id) return res.status(400).send('항목이 올바르지 않습니다.');

    const data = loadUserData();
    const index = data.favorites.findIndex(fav => fav.id === item.id);
    if (index >= 0) {
        data.favorites.splice(index, 1);
    } else {
        data.favorites.push(item);
    }
    saveUserData(data);
    res.json({ success: true, favorites: data.favorites });
});

// 서버 실행
app.listen(PORT, '0.0.0.0', () => {
    console.log(`통합 음악 플레이어 서버가 http://localhost:${PORT} 및 http://${getLocalIpAddress()}:${PORT} 에서 실행 중입니다.`);
});
