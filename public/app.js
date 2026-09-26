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
const playerAlbum = document.getElementById('player-album');
const playerCover = document.getElementById('player-cover');
const playerCoverFallback = document.getElementById('player-cover-fallback');
const playerSourceBadge = document.getElementById('player-source-badge');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const seekBar = document.getElementById('seek-bar');
const currentTimeSpan = document.getElementById('current-time');
const totalTimeSpan = document.getElementById('total-time');
const volumeSlider = document.getElementById('volume-slider');
const btnFavToggle = document.getElementById('btn-favorite-toggle');

// 전용 '지금 재생 중' Hero 화면 및 LP 턴테이블 DOM 요소
const heroCoverImg = document.getElementById('hero-cover-img');
const heroCoverFallback = document.getElementById('hero-cover-fallback');
const heroTitle = document.getElementById('hero-title');
const heroArtist = document.getElementById('hero-artist');
const heroAlbum = document.getElementById('hero-album');
const heroSourceBadge = document.getElementById('hero-source-badge');
const heroBtnPlay = document.getElementById('hero-btn-play');
const heroBtnPrev = document.getElementById('hero-btn-prev');
const heroBtnNext = document.getElementById('hero-btn-next');
const queueCarousel = document.getElementById('nowplaying-queue-carousel');
const queueCountText = document.getElementById('queue-count-text');

// LP 턴테이블 및 톤암 관련 요소
const vinylRecord = document.getElementById('vinyl-record');
const vinylLabelImg = document.getElementById('vinyl-label-img');
const vinylLabelFallback = document.getElementById('vinyl-label-fallback');
const tonearmAssembly = document.getElementById('tonearm-assembly');
const turntableLamp = document.getElementById('turntable-lamp');
const badgeRpmDisplay = document.getElementById('badge-rpm-display');
const btnRpm33 = document.getElementById('btn-rpm-33');
const btnRpm45 = document.getElementById('btn-rpm-45');

// 소리 설정 모달 및 컨트롤 요소
const btnSoundSettings = document.getElementById('btn-sound-settings');
const soundModal = document.getElementById('sound-modal');
const btnCloseSound = document.getElementById('btn-close-sound');
const btnApplySound = document.getElementById('btn-apply-sound');
const toggleCrackle = document.getElementById('toggle-crackle');
const sliderCrackleVol = document.getElementById('slider-crackle-vol');
const crackleVolLabel = document.getElementById('crackle-vol-label');
const toggleWarmEq = document.getElementById('toggle-warm-eq');

// RPM 상태 관리 (기본 33 RPM: 1.8초, 45 RPM: 1.33초)
let currentRpm = 33;
let currentRpmDuration = '1.8s';

// Web Audio API 아날로그 바이닐 사운드 엔진 변수
let audioCtx = null;
let crackleNode = null;
let crackleGain = null;
let warmLowFilter = null;
let warmHighFilter = null;
let isAudioEngineInit = false;

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

let ytProgressInterval = null;

// 유튜브 상태 변경 감지
function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        isPlaying = true;
        updatePlayPauseIcon();
        // 유튜브 재생 중 주기적 시간/톤암 각도 업데이트
        if (ytProgressInterval) clearInterval(ytProgressInterval);
        ytProgressInterval = setInterval(() => {
            if (ytPlayer && ytPlayer.getCurrentTime && ytPlayer.getDuration) {
                const cur = ytPlayer.getCurrentTime();
                const dur = ytPlayer.getDuration();
                if (dur > 0) {
                    currentTimeSpan.textContent = formatTime(cur);
                    totalTimeSpan.textContent = formatTime(dur);
                    const progress = cur / dur;
                    seekBar.value = progress * 100;
                    updateTonearmPosition(progress);
                }
            }
        }, 500);
    } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
        isPlaying = false;
        if (ytProgressInterval) clearInterval(ytProgressInterval);
        updatePlayPauseIcon();
        if (event.data === YT.PlayerState.ENDED) {
            playNextTrack();
        }
    }
}

// 2. 탭 전환 이벤트 리스너 설정
function switchTab(tabId) {
    document.querySelectorAll('.nav-item').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.tab-pane').forEach(p => {
        p.classList.toggle('active', p.id === `tab-${tabId}`);
    });

    if (tabId === 'frequent') loadFrequentTracks();
    if (tabId === 'favorites') loadFavorites();
}

document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        switchTab(tabId);
    });
});

// 하단 플레이어 트랙 정보 클릭 시 '지금 재생 중' 전용 뷰로 이동
document.querySelector('.track-info').addEventListener('click', (e) => {
    // 즐겨찾기 버튼 클릭인 경우는 제외
    if (e.target.closest('#btn-favorite-toggle')) return;
    switchTab('nowplaying');
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
                artist: f.artist,
                album: f.album,
                coverUrl: f.coverUrl,
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

    let videoId = urlInput;
    const match = urlInput.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (match && match[1]) {
        videoId = match[1];
    }

    const track = {
        id: videoId,
        title: `YouTube 음원 (${videoId})`,
        artist: 'YouTube',
        album: '온라인 스트리밍',
        coverUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
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
        const artistText = track.artist ? `<span class="track-artist">${track.artist}</span>` : '';

        // 앨범 커버 이미지 또는 기본 썸네일
        const coverHtml = track.coverUrl
            ? `<img src="${track.coverUrl}" class="track-thumb" alt="Cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div class="track-thumb-fallback" style="display:none;"><i class="fa-solid fa-music"></i></div>`
            : `<div class="track-thumb-fallback"><i class="fa-solid fa-music"></i></div>`;

        item.innerHTML = `
            <div class="track-details">
                ${coverHtml}
                <div class="track-meta">
                    <span class="track-name">${track.title}</span>
                    ${artistText}
                </div>
                <span class="track-play-badge ${badgeClass}">${track.type}</span>
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

// 6. 음원 재생 코어 함수 (앨범 아트 및 정보 바인딩)
async function playTrack(track) {
    currentTrack = track;
    playerTitle.textContent = track.title || '알 수 없는 곡';
    playerSub.textContent = track.artist ? track.artist : (track.type === 'local' ? '내 컴퓨터 로컬 파일' : '유튜브 스트리밍');
    playerAlbum.textContent = track.album ? `앨범: ${track.album}` : '';
    playerSourceBadge.textContent = track.type.toUpperCase();
    playerSourceBadge.className = `track-badge ${track.type === 'local' ? 'badge-local' : 'badge-youtube'}`;

    // 하단 플레이어 앨범 커버 이미지 바인딩
    if (track.coverUrl) {
        playerCover.src = track.coverUrl;
        playerCover.style.display = 'block';
        playerCoverFallback.style.display = 'none';
        playerCover.onerror = () => {
            playerCover.style.display = 'none';
            playerCoverFallback.style.display = 'flex';
        };
    } else {
        playerCover.style.display = 'none';
        playerCoverFallback.style.display = 'flex';
    }

    // 중앙 전용 Hero 화면 앨범 커버 및 상세 정보 동기화
    heroTitle.textContent = track.title || '알 수 없는 곡';
    heroArtist.textContent = track.artist || '알 수 없는 아티스트';
    heroAlbum.textContent = track.album ? `앨범: ${track.album}` : (track.type === 'local' ? '로컬 저장소 음원' : '온라인 스트리밍');
    heroSourceBadge.textContent = track.type.toUpperCase();
    heroSourceBadge.className = `track-badge ${track.type === 'local' ? 'badge-local' : 'badge-youtube'}`;

    // 1. 우측 앨범 자켓 이미지 바인딩
    if (track.coverUrl) {
        heroCoverImg.src = track.coverUrl;
        heroCoverImg.style.display = 'block';
        heroCoverFallback.style.display = 'none';
        heroCoverImg.onerror = () => {
            heroCoverImg.style.display = 'none';
            heroCoverFallback.style.display = 'flex';
        };
    } else {
        heroCoverImg.style.display = 'none';
        heroCoverFallback.style.display = 'flex';
    }

    // 2. LP판 중앙 라벨에 앨범 사진 적용 및 턴테이블 안착 애니메이션 트리거
    if (vinylRecord) {
        // 애니메이션 클래스 리셋하여 다시 올려지는 모션 실행
        vinylRecord.classList.remove('placing');
        void vinylRecord.offsetWidth; // 리플로우 강제 트리거
        vinylRecord.classList.add('placing');

        // 안착 모션 종료(0.65초) 후 placing 클래스를 제거하여 회전(spinning)과 충돌 방지
        setTimeout(() => {
            if (vinylRecord) vinylRecord.classList.remove('placing');
        }, 650);

        if (track.coverUrl) {
            vinylLabelImg.src = track.coverUrl;
            vinylLabelImg.style.display = 'block';
            vinylLabelFallback.style.display = 'none';
            vinylLabelImg.onerror = () => {
                vinylLabelImg.style.display = 'none';
                vinylLabelFallback.style.display = 'block';
            };
        } else {
            vinylLabelImg.style.display = 'none';
            vinylLabelFallback.style.display = 'block';
        }
    }

    // 하단 다른 곡 목록 (대기열) 캐러셀 갱신
    updateQueueCarousel();

    // 재생 횟수 기록
    fetch('/api/play-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(track)
    });

    checkFavoriteStatus(track.id);

    // 턴테이블 모션 및 지연 재생 시작
    startTurntableAndPlay(track);
}

// 톤암 각도 제어 상수 (도 단위)
const TONEARM_REST_ANGLE = 0;         // 대기 위치: 0도 (레스트)
const TONEARM_START_ANGLE = 16.5;     // LP판 시작 트랙(외주 그루브 안쪽으로 더 이동): 16.5도
const TONEARM_END_ANGLE = 24.0;       // LP판 종료 트랙(라벨 이미지 근처): 24.0도
const TONEARM_TOTAL_SPAN = TONEARM_END_ANGLE - TONEARM_START_ANGLE; // 7.5도 총 회전폭

let tonearmMoveTimer = null;
let currentTrackAngleRange = { startAngle: 16.5, endAngle: 24.0 };

// 33 / 45 RPM 속도 전환 함수
function setTurntableSpeed(rpm) {
    currentRpm = rpm;
    currentRpmDuration = rpm === 45 ? '1.33s' : '1.8s';
    btnRpm33.classList.toggle('active', rpm === 33);
    btnRpm45.classList.toggle('active', rpm === 45);
    badgeRpmDisplay.textContent = rpm === 45 ? '45 RPM' : '33⅓ RPM';
    if (vinylRecord) {
        vinylRecord.style.animationDuration = currentRpmDuration;
    }
}

btnRpm33.addEventListener('click', () => setTurntableSpeed(33));
btnRpm45.addEventListener('click', () => setTurntableSpeed(45));

// Web Audio API 아날로그 바이닐 사운드 엔진 초기화
function initAnalogSoundEngine() {
    if (isAudioEngineInit) return;
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();

        // 1. 바이닐 표면 크랙클 노이즈 버퍼 생성 (4초 분량 무한 루프)
        const bufferSize = audioCtx.sampleRate * 4;
        const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;

        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99 * b0 + white * 0.04;
            b1 = 0.95 * b1 + white * 0.08;
            b2 = 0.85 * b2 + white * 0.15;
            let val = (b0 + b1 + b2) * 0.05;

            // 랜덤 간격 바이닐 스파이크 팝 (타닥거리는 LP 특유의 바늘 잡음)
            if (Math.random() < 0.0016) {
                val += (Math.random() > 0.5 ? 1 : -1) * (0.3 + Math.random() * 0.4);
            }
            output[i] = val;
        }

        crackleNode = audioCtx.createBufferSource();
        crackleNode.buffer = noiseBuffer;
        crackleNode.loop = true;

        crackleGain = audioCtx.createGain();
        crackleGain.gain.value = 0; // 초기 볼륨 0

        const bandpass = audioCtx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 2400;
        bandpass.Q.value = 0.85;

        crackleNode.connect(bandpass);
        bandpass.connect(crackleGain);
        crackleGain.connect(audioCtx.destination);
        crackleNode.start(0);

        // 2. 로컬 오디오용 아날로그 웜 톤 EQ 필터 (Warm Tube Filter)
        const mediaSource = audioCtx.createMediaElementSource(audioPlayer);

        warmLowFilter = audioCtx.createBiquadFilter();
        warmLowFilter.type = 'lowshelf';
        warmLowFilter.frequency.value = 200;
        warmLowFilter.gain.value = toggleWarmEq.checked ? 3.5 : 0;

        warmHighFilter = audioCtx.createBiquadFilter();
        warmHighFilter.type = 'lowpass';
        warmHighFilter.frequency.value = toggleWarmEq.checked ? 8500 : 20000;
        warmHighFilter.Q.value = 0.7;

        mediaSource.connect(warmLowFilter);
        warmLowFilter.connect(warmHighFilter);
        warmHighFilter.connect(audioCtx.destination);

        isAudioEngineInit = true;
    } catch (e) {
        console.warn('아날로그 사운드 엔진 초기화 생략:', e);
    }
}

// 바이닐 크랙클 잡음 재생 함수
function startVinylCrackle() {
    if (!isAudioEngineInit) initAnalogSoundEngine();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    if (crackleGain && toggleCrackle.checked) {
        const targetVol = parseFloat(sliderCrackleVol.value);
        crackleGain.gain.cancelScheduledValues(audioCtx.currentTime);
        crackleGain.gain.setValueAtTime(crackleGain.gain.value, audioCtx.currentTime);
        crackleGain.gain.linearRampToValueAtTime(targetVol, audioCtx.currentTime + 0.8);
    }
}

// 바이닐 크랙클 잡음 정지 함수
function stopVinylCrackle() {
    if (crackleGain && audioCtx) {
        crackleGain.gain.cancelScheduledValues(audioCtx.currentTime);
        crackleGain.gain.setValueAtTime(crackleGain.gain.value, audioCtx.currentTime);
        crackleGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.4);
    }
}

// 소리 설정 이벤트 핸들러
btnSoundSettings.addEventListener('click', () => {
    soundModal.classList.add('open');
});

btnCloseSound.addEventListener('click', () => {
    soundModal.classList.remove('open');
});

btnApplySound.addEventListener('click', () => {
    soundModal.classList.remove('open');
});

toggleCrackle.addEventListener('change', () => {
    if (isPlaying) {
        toggleCrackle.checked ? startVinylCrackle() : stopVinylCrackle();
    }
});

sliderCrackleVol.addEventListener('input', () => {
    const val = parseFloat(sliderCrackleVol.value);
    crackleVolLabel.textContent = `${Math.round(val * 100)}%`;
    if (crackleGain && isPlaying && toggleCrackle.checked) {
        crackleGain.gain.setValueAtTime(val, audioCtx.currentTime);
    }
});

toggleWarmEq.addEventListener('change', () => {
    if (warmLowFilter && warmHighFilter && audioCtx) {
        const isWarm = toggleWarmEq.checked;
        warmLowFilter.gain.setValueAtTime(isWarm ? 3.5 : 0, audioCtx.currentTime);
        warmHighFilter.frequency.setValueAtTime(isWarm ? 8500 : 20000, audioCtx.currentTime);
    }
});

// 현재 곡이 속한 동일 앨범의 연속 트랙 정보 계산 함수
function getAlbumGroupInfo() {
    if (!currentPlaylist || currentPlaylist.length === 0 || currentIndex < 0) {
        return { indexInAlbum: 0, totalInAlbum: 1 };
    }

    const cur = currentPlaylist[currentIndex];
    const albumName = cur.album ? cur.album.trim().toLowerCase() : null;

    if (!albumName || albumName === '알 수 없는 앨범' || albumName === '온라인 스트리밍') {
        return { indexInAlbum: 0, totalInAlbum: 1 };
    }

    let startIdx = currentIndex;
    while (startIdx > 0 && currentPlaylist[startIdx - 1].album && currentPlaylist[startIdx - 1].album.trim().toLowerCase() === albumName) {
        startIdx--;
    }

    let endIdx = currentIndex;
    while (endIdx < currentPlaylist.length - 1 && currentPlaylist[endIdx + 1].album && currentPlaylist[endIdx + 1].album.trim().toLowerCase() === albumName) {
        endIdx++;
    }

    const totalInAlbum = (endIdx - startIdx) + 1;
    const indexInAlbum = currentIndex - startIdx;

    return { indexInAlbum, totalInAlbum };
}

// 현재 곡의 톤암 이동 각도 범위 계산
function calculateTrackAngleRange() {
    const { indexInAlbum, totalInAlbum } = getAlbumGroupInfo();
    const trackSpan = TONEARM_TOTAL_SPAN / totalInAlbum;
    const startAngle = TONEARM_START_ANGLE + (trackSpan * indexInAlbum);
    const endAngle = startAngle + trackSpan;
    return { startAngle, endAngle };
}

// 톤암 안착 시점에 LP판 회전과 음악, 아날로그 사운드를 동시에 시작하는 시동 함수
function startTurntableAndPlay(track) {
    if (tonearmMoveTimer) clearTimeout(tonearmMoveTimer);

    // 1. 오디오 컨텍스트 사용자 제스처 활성화
    if (!isAudioEngineInit) initAnalogSoundEngine();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    // 2. 초기 상태: 전원 LED는 켜지고 LP판은 톤암이 안착할 때까지 정지
    if (turntableLamp) turntableLamp.classList.add('active');
    if (vinylRecord) {
        vinylRecord.classList.remove('spinning');
        vinylRecord.style.animationDuration = currentRpmDuration;
    }

    // 3. 현재 트랙의 각도 범위 산출 (16.5도 기준)
    currentTrackAngleRange = calculateTrackAngleRange();
    const targetStart = currentTrackAngleRange.startAngle;

    // 4. 톤암을 먼저 LP판 시작 트랙 위로 이동
    if (tonearmAssembly) {
        tonearmAssembly.style.transition = 'transform 1.2s cubic-bezier(0.25, 1, 0.5, 1)';
        tonearmAssembly.style.transform = `rotate(${targetStart}deg)`;
    }

    // 5. 톤암이 LP판 위에 완전히 올라간 후(1.2초 뒤): LP판 회전 시작, 바이닐 잡음 및 음악 동시 재생!
    tonearmMoveTimer = setTimeout(() => {
        if (vinylRecord) vinylRecord.classList.add('spinning');
        startVinylCrackle(); // LP 특유의 아날로그 크랙클 바늘 잡음 시작

        if (track.type === 'local') {
            if (ytPlayer && isYtReady && ytPlayer.pauseVideo) {
                ytPlayer.pauseVideo();
            }
            audioPlayer.src = `/api/stream?path=${encodeURIComponent(track.source)}`;
            audioPlayer.play();
            isPlaying = true;
        } else if (track.type === 'youtube') {
            audioPlayer.pause();
            if (ytPlayer && isYtReady) {
                ytPlayer.loadVideoById(track.source);
                ytPlayer.playVideo();
                isPlaying = true;
            }
        }
        updatePlayPauseIcon();
    }, 1200);
}

// 음악 진행률(0~1)에 따라 톤암을 천천히 왼쪽(내주 라벨 근처)으로 이동
function updateTonearmPosition(progress) {
    if (!isPlaying || !tonearmAssembly) return;
    const clampedProgress = Math.min(Math.max(progress, 0), 1);
    const { startAngle, endAngle } = currentTrackAngleRange;
    const currentAngle = startAngle + ((endAngle - startAngle) * clampedProgress);

    // 재생 중에는 0.5초 선형 보간으로 미세하게 전진
    tonearmAssembly.style.transition = 'transform 0.5s linear';
    tonearmAssembly.style.transform = `rotate(${currentAngle.toFixed(2)}deg)`;
}

// 하단 다른 곡 목록 (Queue Carousel) 동적 렌더링 함수
function updateQueueCarousel() {
    if (!queueCarousel) return;
    queueCarousel.innerHTML = '';

    if (!currentPlaylist || currentPlaylist.length === 0) {
        queueCarousel.innerHTML = '<p class="empty-msg">대기열에 다른 곡이 없습니다.</p>';
        queueCountText.textContent = '0곡';
        return;
    }

    queueCountText.textContent = `${currentPlaylist.length}곡`;

    currentPlaylist.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = 'queue-card';
        if (currentTrack && currentTrack.id === item.id) {
            card.classList.add('current');
        }

        const coverHtml = item.coverUrl
            ? `<img src="${item.coverUrl}" class="queue-card-cover" alt="Cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div class="queue-card-fallback" style="display:none;"><i class="fa-solid fa-music"></i></div>`
            : `<div class="queue-card-fallback"><i class="fa-solid fa-music"></i></div>`;

        card.innerHTML = `
            ${coverHtml}
            <div class="queue-card-title">${item.title}</div>
            <div class="queue-card-artist">${item.artist || item.type}</div>
        `;

        card.addEventListener('click', () => {
            currentIndex = idx;
            playTrack(item);
        });

        queueCarousel.appendChild(card);
    });
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
        if (tonearmMoveTimer) clearTimeout(tonearmMoveTimer);

        // 일시정지 시: 톤암을 레스트(0도)로 복귀하고 LP 회전 및 크랙클 잡음 정지
        stopVinylCrackle();
        if (tonearmAssembly) {
            tonearmAssembly.style.transition = 'transform 1.2s cubic-bezier(0.25, 1, 0.5, 1)';
            tonearmAssembly.style.transform = `rotate(${TONEARM_REST_ANGLE}deg)`;
        }
        if (vinylRecord) vinylRecord.classList.remove('spinning');
        if (turntableLamp) turntableLamp.classList.remove('active');
    } else {
        // 재생 재개 시: 톤암이 다시 올라가고 재생 시작
        startTurntableAndPlay(currentTrack);
    }
    updatePlayPauseIcon();
}

btnPlayPause.addEventListener('click', togglePlayPause);
heroBtnPlay.addEventListener('click', togglePlayPause);
heroBtnNext.addEventListener('click', playNextTrack);
heroBtnPrev.addEventListener('click', playPrevTrack);

if (vinylRecord) {
    vinylRecord.addEventListener('click', togglePlayPause);
}

function updatePlayPauseIcon() {
    const playIcon = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
    btnPlayPause.innerHTML = playIcon;
    heroBtnPlay.innerHTML = playIcon;
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

// 9. 로컬 오디오 재생 진행 감지 및 톤암 실시간 위치 연동
audioPlayer.addEventListener('timeupdate', () => {
    if (currentTrack && currentTrack.type === 'local') {
        const cur = audioPlayer.currentTime;
        const dur = audioPlayer.duration || 0;
        currentTimeSpan.textContent = formatTime(cur);
        totalTimeSpan.textContent = formatTime(dur);
        if (dur > 0) {
            const progress = cur / dur;
            seekBar.value = progress * 100;
            // 톤암 실시간 전진 업데이트
            updateTonearmPosition(progress);
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
            artist: 'YouTube 추천',
            album: item.desc,
            coverUrl: `https://img.youtube.com/vi/${item.id}/hqdefault.jpg`,
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

// 15. 음원 사이트 공식 웹 플레이어 팝업 런처
document.querySelectorAll('.service-launch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetUrl = btn.getAttribute('data-url');
        // 세션 및 로그인이 유지되는 독립 팝업 윈도우 생성
        const width = 1200;
        const height = 800;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        
        window.open(
            targetUrl,
            '_blank',
            `width=${width},height=${height},top=${top},left=${left},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
        );
    });
});

// 16. 페이지 최초 진입 시 로컬 음원 자동 스캔 및 다른 곡 목록 초기화
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/api/scan-local');
        const data = await res.json();
        if (data.files && data.files.length > 0) {
            currentPlaylist = data.files.map(f => ({
                id: f.fullPath,
                title: f.title,
                artist: f.artist,
                album: f.album,
                coverUrl: f.coverUrl,
                type: 'local',
                source: f.fullPath
            }));
            
            // 로컬 보관함 목록 렌더링
            renderTrackList('local-track-list', currentPlaylist);

            // 첫 번째 곡을 기본 선택 상태로 세팅 (자동 재생은 하지 않고 메타 정보만 로드)
            const first = currentPlaylist[0];
            heroTitle.textContent = first.title;
            heroArtist.textContent = first.artist;
            heroAlbum.textContent = first.album ? `앨범: ${first.album}` : '';
            if (first.coverUrl) {
                heroCoverImg.src = first.coverUrl;
                heroCoverImg.style.display = 'block';
                heroCoverFallback.style.display = 'none';

                if (vinylLabelImg) {
                    vinylLabelImg.src = first.coverUrl;
                    vinylLabelImg.style.display = 'block';
                    vinylLabelFallback.style.display = 'none';
                }
            }
            currentTrack = first;
            updateQueueCarousel();
        }
    } catch (e) {
        console.warn('초기 로컬 음악 스캔 생략:', e);
    }
});

