// 필요한 기본 모듈 불러오기
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 3000;

// 미들웨어 설정
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 데이터 저장용 JSON 파일 경로
const DATA_FILE = path.join(__dirname, 'userData.json');

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

// 1. 지원하는 오디오 확장자 목록
const SUPPORTED_EXTENSIONS = ['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac'];

// 폴더 재귀 탐색 함수
function scanDirectory(dirPath, fileList = []) {
    try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const item of items) {
            const fullPath = path.join(dirPath, item.name);
            if (item.isDirectory()) {
                // 시스템 폴더나 숨김 폴더 제외
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
        console.warn(`폴더 읽기 권한 없음 또는 오류: ${dirPath}`);
    }
    return fileList;
}

// 2. 기본 음악 폴더 및 특정 경로 스캔 API
app.get('/api/scan-local', (req, res) => {
    // 사용자가 요청한 폴더 경로가 없으면 기본 사용자 Music 폴더 탐색
    const targetDir = req.query.path || path.join(os.homedir(), 'Music');
    if (!fs.existsSync(targetDir)) {
        return res.status(404).json({ error: '경로가 존재하지 않습니다.', path: targetDir });
    }
    const files = scanDirectory(targetDir);
    res.json({ targetDir, files });
});

// 3. 로컬 음원 스트리밍 API
app.get('/api/stream', (req, res) => {
    const filePath = req.query.path;
    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).send('음원 파일을 찾을 수 없습니다.');
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // HTTP Range 요청 처리 (음악 탐색/시크 지원)
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

// 4. 자주 듣는 음악 및 즐겨찾기 조회 API
app.get('/api/stats', (req, res) => {
    const data = loadUserData();
    res.json(data);
});

// 5. 음원 재생 시 재생 횟수 누적 API
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

// 6. 즐겨찾기 토글 API
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
app.listen(PORT, () => {
    console.log(`통합 음악 플레이어 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
