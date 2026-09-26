// 전역 상태 변수들
let currentTrack = null;
let currentPlaylist = [];
let currentIndex = -1;
let isPlaying = false;
let ytPlayer = null;
let isYtReady = false;

// DOM 요소 참조
const audioPlayer = document.getElementById('audio-player');
const playerTitle = document.getElementById('player-title');
const playerSub = document.getElementById('player-sub');
const playerSourceBadge = document.getElementById('player-source-badge');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const seekBar = document.getElementById('seek-bar');
const currentTimeSpan = document.getElementById('current-time');
const totalTimeSpan = document.getElementById('total-time');
const volumeSlider = document.getElementById('volume-slider');
const btnFavToggle = document.getElementById('btn-favorite-toggle');

// 1. YouTube IFrame API 준비 완료 콜백 (글로벌 등록)
window.onYouTubeIframeAPIReady = function() {
    ytPlayer = new YT.Player('youtube-player', {
        height: '240',
        width: '426',
        videoId: 'jfKfPfyJRdk', // 기본 로파이 음악 ID
        playerVars: {
            'playsinline': 1,
            'controls': 0
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
};

function onPlayerReady() {
    isYtReady = true;
}

// 유튜브 상태 변경 감지
function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        isPlaying = true;
        updatePlayPauseIcon();
    } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
        isPlaying = false;
        updatePlayPauseIcon();
        if (event.data === YT.PlayerState.ENDED) {
            playNextTrack();
        }
    }
}

// 2. 탭 전환 이벤트 리스너 설정
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        
        btn.classList.add('active');
        const tabId = btn.getAttribute('data-tab');
        document.getElementById(`tab-${tabId}`).classList.add('active');

        // 통계 탭 열 때 최신 데이터 갱신
        if (tabId === 'frequent') loadFrequentTracks();
        if (tabId === 'favorites') loadFavorites();
    });
});

// 3. 로컬 음원 폴더 스캔 기능
document.getElementById('btn-scan').addEventListener('click', async () => {
    const inputPath = document.getElementById('local-path-input').value.trim();
    const query = inputPath ? `?path=${encodeURIComponent(inputPath)}` : '';
    
    try {
        const res = await fetch(`/api/scan-local${query}`);
        const data = await res.json();
        if (data.files) {
            renderTrackList('local-track-list', data.files.map(f => ({
                id: f.fullPath,
                title: f.title,
                type: 'local',
                source: f.fullPath
            })));
        }
    } catch (err) {
        alert('로컬 음원을 불러오는 중 오류가 발생했습니다.');
    }
});

// 4. 유튜브 링크 재생 추가 버튼
document.getElementById('btn-add-stream').addEventListener('click', () => {
    const urlInput = document.getElementById('stream-url-input').value.trim();
    if (!urlInput) return;

    // 유튜브 비디오 ID 파싱 (단축 링크, 일반 링크 대응)
    let videoId = urlInput;
    const match = urlInput.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (match && match[1]) {
        videoId = match[1];
    }

    const track = {
        id: videoId,
        title: `YouTube 음원 (${videoId})`,
        type: 'youtube',
        source: videoId
    };

    playTrack(track);
});

// 5. 음원 목록 렌더링 헬퍼 함수
function renderTrackList(elementId, tracks) {
    const container = document.getElementById(elementId);
    container.innerHTML = '';

    if (!tracks || tracks.length === 0) {
        container.innerHTML = '<p class="empty-msg">등록된 음원이 없습니다.</p>';
        return;
    }

    tracks.forEach((track, index) => {
        const item = document.createElement('div');
        item.className = 'track-item';
        if (currentTrack && currentTrack.id === track.id) {
            item.classList.add('playing');
        }

        const badgeClass = track.type === 'local' ? 'badge-local' : 'badge-youtube';
        const countInfo = track.count ? `<span class="play-count-tag"><i class="fa-solid fa-headphones"></i> ${track.count}회</span>` : '';

        item.innerHTML = `
            <div class="track-details">
                <span class="track-play-badge ${badgeClass}">${track.type}</span>
                <span class="track-name">${track.title}</span>
            </div>
            <div>
                ${countInfo}
            </div>
        `;

        item.addEventListener('click', () => {
            currentPlaylist = tracks;
            currentIndex = index;
            playTrack(track);
        });

        container.appendChild(item);
    });
}

// 6. 음원 재생 코어 함수 (로컬/유튜브 분기 처리)
async function playTrack(track) {
    currentTrack = track;
    playerTitle.textContent = track.title;
    playerSub.textContent = track.type === 'local' ? '내 컴퓨터 로컬 파일' : '유튜브 스트리밍';
    playerSourceBadge.textContent = track.type.toUpperCase();
    playerSourceBadge.className = `track-badge ${track.type === 'local' ? 'badge-local' : 'badge-youtube'}`;

    // 재생 횟수 기록
    fetch('/api/play-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(track)
    });

    checkFavoriteStatus(track.id);

    if (track.type === 'local') {
        // 유튜브 일시정지 후 로컬 오디오 재생
        if (ytPlayer && isYtReady && ytPlayer.pauseVideo) {
            ytPlayer.pauseVideo();
        }
        audioPlayer.src = `/api/stream?path=${encodeURIComponent(track.source)}`;
        audioPlayer.play();
        isPlaying = true;
    } else if (track.type === 'youtube') {
        // 로컬 오디오 일시정지 후 유튜브 재생
        audioPlayer.pause();
        if (ytPlayer && isYtReady) {
            ytPlayer.loadVideoById(track.source);
            ytPlayer.playVideo();
            isPlaying = true;
        }
    }
    updatePlayPauseIcon();
}

// 7. 재생/일시정지 토글
function togglePlayPause() {
    if (!currentTrack) return;

    if (isPlaying) {
        if (currentTrack.type === 'local') {
            audioPlayer.pause();
        } else if (ytPlayer && isYtReady) {
            ytPlayer.pauseVideo();
        }
        isPlaying = false;
    } else {
        if (currentTrack.type === 'local') {
            audioPlayer.play();
        } else if (ytPlayer && isYtReady) {
            ytPlayer.playVideo();
        }
        isPlaying = true;
    }
    updatePlayPauseIcon();
}

btnPlayPause.addEventListener('click', togglePlayPause);

function updatePlayPauseIcon() {
    btnPlayPause.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
}

// 8. 이전곡 / 다음곡 이동
function playNextTrack() {
    if (currentPlaylist.length === 0) return;
    currentIndex = (currentIndex + 1) % currentPlaylist.length;
    playTrack(currentPlaylist[currentIndex]);
}

function playPrevTrack() {
    if (currentPlaylist.length === 0) return;
    currentIndex = (currentIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
    playTrack(currentPlaylist[currentIndex]);
}

btnNext.addEventListener('click', playNextTrack);
btnPrev.addEventListener('click', playPrevTrack);

// 9. 로컬 오디오 탐색 및 시간 표시
audioPlayer.addEventListener('timeupdate', () => {
    if (currentTrack && currentTrack.type === 'local') {
        const cur = audioPlayer.currentTime;
        const dur = audioPlayer.duration || 0;
        currentTimeSpan.textContent = formatTime(cur);
        totalTimeSpan.textContent = formatTime(dur);
        if (dur > 0) {
            seekBar.value = (cur / dur) * 100;
        }
    }
});

audioPlayer.addEventListener('ended', playNextTrack);

// 탐색 바 조작
seekBar.addEventListener('input', () => {
    if (currentTrack && currentTrack.type === 'local' && audioPlayer.duration) {
        audioPlayer.currentTime = (seekBar.value / 100) * audioPlayer.duration;
    } else if (currentTrack && currentTrack.type === 'youtube' && ytPlayer && isYtReady) {
        const dur = ytPlayer.getDuration();
        ytPlayer.seekTo((seekBar.value / 100) * dur, true);
    }
});

// 볼륨 제어
volumeSlider.addEventListener('input', () => {
    const vol = parseFloat(volumeSlider.value);
    audioPlayer.volume = vol;
    if (ytPlayer && isYtReady && ytPlayer.setVolume) {
        ytPlayer.setVolume(vol * 100);
    }
});

// 시간 초 포맷 변환 함수 (0:00)
function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// 10. 즐겨찾기 상태 점검 및 토글
async function checkFavoriteStatus(trackId) {
    const res = await fetch('/api/stats');
    const data = await res.json();
    const isFav = data.favorites && data.favorites.some(f => f.id === trackId);
    btnFavToggle.classList.toggle('active', isFav);
    btnFavToggle.querySelector('i').className = isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
}

btnFavToggle.addEventListener('click', async () => {
    if (!currentTrack) return;
    const res = await fetch('/api/favorites/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: currentTrack })
    });
    const data = await res.json();
    checkFavoriteStatus(currentTrack.id);
});

// 11. 자주 듣는 음악 (Top Played) 불러오기
async function loadFrequentTracks() {
    const res = await fetch('/api/stats');
    const data = await res.json();
    const list = Object.values(data.playCounts || {}).sort((a, b) => b.count - a.count);
    renderTrackList('frequent-track-list', list);
}

// 12. 즐겨찾기 목록 불러오기
async function loadFavorites() {
    const res = await fetch('/api/stats');
    const data = await res.json();
    renderTrackList('favorites-track-list', data.favorites || []);
}

// 13. 추천 퀵 카드 초기화
const defaultSuggestions = [
    { title: "Lofi Hip Hop 스트리밍", id: "jfKfPfyJRdk", desc: "편안한 휴식과 집중 음악" },
    { title: "재즈 피아노 카페 음악", id: "Dx5qFachd3A", desc: "분위기 있는 어쿠스틱 재즈" },
    { title: "신나는 K-POP 믹스", id: "gdZLi9oWNZg", desc: "다이너마이트 & 인기 팝" }
];

const quickCards = document.getElementById('quick-cards');
defaultSuggestions.forEach(item => {
    const card = document.createElement('div');
    card.className = 'quick-card';
    card.innerHTML = `
        <i class="fa-brands fa-youtube" style="color: #e50914; font-size: 24px;"></i>
        <h4>${item.title}</h4>
        <p>${item.desc}</p>
    `;
    card.addEventListener('click', () => {
        playTrack({
            id: item.id,
            title: item.title,
            type: 'youtube',
            source: item.id
        });
    });
    quickCards.appendChild(card);
});

// 14. DLNA 모달 및 캐스팅 제어 로직
const dlnaModal = document.getElementById('dlna-modal');
const btnDlnaModal = document.getElementById('btn-dlna-modal');
const btnCloseDlna = document.getElementById('btn-close-dlna');
const btnRefreshDlna = document.getElementById('btn-refresh-dlna');
const dlnaDeviceList = document.getElementById('dlna-device-list');

// 모달 열기 및 기기 검색
btnDlnaModal.addEventListener('click', () => {
    dlnaModal.classList.add('open');
    fetchDlnaDevices();
});

// 모달 닫기
btnCloseDlna.addEventListener('click', () => {
    dlnaModal.classList.remove('open');
});

// 기기 새로고침 버튼
btnRefreshDlna.addEventListener('click', fetchDlnaDevices);

// 로컬 네트워크의 DLNA 기기 목록 가져오기 함수
async function fetchDlnaDevices() {
    dlnaDeviceList.innerHTML = '<p class="empty-msg"><i class="fa-solid fa-spinner fa-spin"></i> 기기 탐색 중...</p>';
    try {
        const res = await fetch('/api/dlna/devices');
        const data = await res.json();
        renderDlnaDevices(data.devices || []);
    } catch (err) {
        dlnaDeviceList.innerHTML = '<p class="empty-msg">기기 목록을 불러오는 중 오류가 발생했습니다.</p>';
    }
}

// DLNA 기기 목록 UI 렌더링 함수
function renderDlnaDevices(devices) {
    dlnaDeviceList.innerHTML = '';
    if (devices.length === 0) {
        dlnaDeviceList.innerHTML = '<p class="empty-msg">네트워크에서 발견된 DLNA 기기(스마트TV/오디오)가 없습니다.</p>';
        return;
    }

    devices.forEach(dev => {
        const item = document.createElement('div');
        item.className = 'device-item';
        item.innerHTML = `
            <div class="device-item-info">
                <i class="fa-solid fa-tv" style="font-size: 20px; color: #1db954;"></i>
                <div>
                    <div class="device-name">${dev.name}</div>
                    <div class="device-host">${dev.host}</div>
                </div>
            </div>
            <button class="device-cast-btn" data-device="${dev.name}">
                <i class="fa-solid fa-tower-broadcast"></i> 재생 전송
            </button>
        `;

        item.querySelector('.device-cast-btn').addEventListener('click', () => {
            castToDlnaDevice(dev.name);
        });

        dlnaDeviceList.appendChild(item);
    });
}

// 특정 DLNA 기기로 현재 곡 전송 함수
async function castToDlnaDevice(deviceName) {
    if (!currentTrack || currentTrack.type !== 'local') {
        alert('현재 로컬 음원 파일만 DLNA 스피커/TV로 바로 전송할 수 있습니다. 로컬 곡을 먼저 선택해주세요.');
        return;
    }

    try {
        const res = await fetch('/api/dlna/play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                deviceName: deviceName,
                trackPath: currentTrack.source,
                title: currentTrack.title
            })
        });
        const result = await res.json();
        if (result.success) {
            alert(`${deviceName} 기기로 재생을 전송했습니다!`);
        } else {
            alert(`전송 실패: ${result.error || '오류 발생'}`);
        }
    } catch (err) {
        alert('DLNA 전송 중 네트워크 통신 오류가 발생했습니다.');
    }
}

