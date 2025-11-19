/**
 * ParkRelief 核心應用邏輯
 * 
 * 功能：
 * - 管理按摩狀態與計時
 * - 建立與儲存痛點事件到 GUN.js
 * - 從 GUN 讀取與顯示事件歷史
 * - 生成與複製分享連結
 * 
 * TDD 進度：
 * - Red: 先寫測試 (tests/tests.js)
 * - Green: 實作函式使測試通過
 * - Refactor: 改進代碼品質
 */

// ============================================
// 1. 應用狀態管理
// ============================================

const AppState = {
    isRunning: false,
    currentDuration: 0,
    totalDuration: 0,
    timerInterval: null,
    gun: null,
    gunSharePath: null
};

// ============================================
// 2. 初始化應用
// ============================================

/**
 * 初始化 GUN 連接與事件監聽
 */
function initializeApp() {
    console.log('[ParkRelief] 初始化應用...');

    // 初始化 GUN（使用公共中繼節點）
    AppState.gun = Gun();
    console.log('[GUN] 已連接');

    // 綁定 UI 事件監聽
    bindUIEvents();

    // 從 GUN 載入已有紀錄
    loadEventsFromGUN();

    // 更新調試資訊
    updateDebugInfo();

    console.log('[ParkRelief] 應用初始化完成');
}

/**
 * 綁定所有 UI 按鈕與輸入事件
 */
function bindUIEvents() {
    // 主控制按鈕
    document.getElementById('startBtn').addEventListener('click', handleStartMassage);
    document.getElementById('stopBtn').addEventListener('click', handleStopMassage);
    document.getElementById('saveBtn').addEventListener('click', handleSaveRecord);
    document.getElementById('shareBtn').addEventListener('click', handleOpenShareModal);
    document.getElementById('refreshBtn').addEventListener('click', () => loadEventsFromGUN());

    // 強度滑桿
    document.getElementById('intensity').addEventListener('input', (e) => {
        document.getElementById('intensityValue').textContent = e.target.value;
    });

    // 分享模態框
    document.getElementById('copyBtn').addEventListener('click', handleCopyShareLink);
    document.getElementById('closeShareBtn').addEventListener('click', handleCloseShareModal);
    document.getElementById('shareModalBackdrop').addEventListener('click', handleCloseShareModal);

    console.log('[UI] 事件監聽已綁定');
}

// ============================================
// 3. 核心函式 (可測試)
// ============================================

/**
 * 建立痛點事件物件
 * @param {string} area - 疼痛部位 (腰部/背部/肩頸)
 * @param {number} intensity - 強度等級 (1-10)
 * @param {number} duration - 按摩時間 (分鐘)
 * @param {string} notes - 可選備註
 * @returns {Object} 事件物件
 */
function createPainEvent(area, intensity, duration, notes = '') {
    const eventId = `painEvent_${Date.now()}`;
    const normalizedIntensity = Math.max(1, Math.min(10, Number(intensity)));
    const normalizedDuration = Math.max(1, Math.floor(Number(duration)));
    
    return {
        id: eventId,
        timestamp: Date.now(),
        timestampStr: new Date().toLocaleString('zh-TW'),
        location: '未指定',
        painArea: String(area),
        intensity: normalizedIntensity,
        duration: normalizedDuration,
        notes: String(notes).trim(),
        deviceStatus: '已停止',
        syncStatus: '新建'
    };
}

/**
 * 儲存事件到 GUN.js
 * @param {Object} event - 痛點事件物件
 * @returns {Promise} 儲存操作 Promise
 */
function saveToGUN(event) {
    return new Promise((resolve, reject) => {
        if (!AppState.gun) {
            console.error('[GUN] 未初始化');
            reject(new Error('GUN 未初始化'));
            return;
        }

        try {
            console.log('[GUN] 開始儲存事件:', event.id);

            // 更新同步狀態為 '同步中'
            updateSyncStatus('同步中');

            // 儲存到 GUN
            AppState.gun
                .get('ParkRelief')
                .get('painEvents')
                .get(event.id)
                .put(event, (ack) => {
                    if (ack.err) {
                        console.error('[GUN] 儲存失敗:', ack.err);
                        updateSyncStatus('同步失敗');
                        reject(new Error(ack.err));
                    } else {
                        console.log('[GUN] 事件已儲存:', event.id);
                        event.syncStatus = '成功';
                        updateSyncStatus('同步成功');
                        resolve(event);
                    }
                });
        } catch (error) {
            console.error('[GUN] 儲存異常:', error);
            updateSyncStatus('同步失敗');
            reject(error);
        }
    });
}

/**
 * 從 GUN 讀取所有事件
 * @returns {Promise<Array>} 事件陣列
 */
function loadFromGUN() {
    return new Promise((resolve, reject) => {
        if (!AppState.gun) {
            console.error('[GUN] 未初始化');
            reject(new Error('GUN 未初始化'));
            return;
        }

        try {
            console.log('[GUN] 開始讀取事件...');
            const events = [];
            let hasData = false;

            // 使用 .on() 監聽事件變化（更可靠）
            AppState.gun
                .get('ParkRelief')
                .get('painEvents')
                .map()
                .on((data, key) => {
                    if (data && typeof data === 'object' && data.id) {
                        // 檢查是否已存在該事件（避免重複）
                        const existingIndex = events.findIndex(e => e.id === data.id);
                        if (existingIndex >= 0) {
                            events[existingIndex] = data;
                        } else {
                            events.push(data);
                        }
                        hasData = true;
                        console.log('[GUN] 已讀取事件:', key, data);
                    }
                });

            // 延遲 resolve，等待 GUN 完成查詢
            setTimeout(() => {
                console.log('[GUN] 讀取完成，共', events.length, '個事件');
                resolve(events);
            }, 800);
        } catch (error) {
            console.error('[GUN] 讀取異常:', error);
            reject(error);
        }
    });
}

/**
 * 切換按摩狀態
 * @param {string} action - "start" 或 "stop"
 */
function toggleMassageStatus(action) {
    const statusEl = document.getElementById('status');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const saveBtn = document.getElementById('saveBtn');

    if (action === 'start') {
        // 防止重複啟動
        if (AppState.isRunning) {
            console.warn('[UI] 按摩已在運行中，忽略重複啟動');
            return;
        }

        AppState.isRunning = true;
        AppState.currentDuration = Number(document.getElementById('duration').value);
        AppState.totalDuration = AppState.currentDuration;

        statusEl.textContent = '按摩中';
        statusEl.style.color = '#f56565';
        startBtn.disabled = true;
        stopBtn.disabled = false;
        saveBtn.disabled = true;

        startTimer();
        console.log('[UI] 按摩已啟動，時長:', AppState.currentDuration, '分鐘');
    } else if (action === 'stop') {
        // 防止重複停止
        if (!AppState.isRunning) {
            console.warn('[UI] 按摩未運行，忽略重複停止');
            return;
        }

        AppState.isRunning = false;
        statusEl.textContent = '已停止';
        statusEl.style.color = '#48bb78';
        startBtn.disabled = false;
        stopBtn.disabled = true;
        saveBtn.disabled = false;

        stopTimer();
        console.log('[UI] 按摩已停止');
    }
}

/**
 * 更新 UI 狀態
 * @param {string} status - 狀態文字
 */
function updateUIStatus(status) {
    console.log('[UI] 更新狀態:', status);
    document.getElementById('status').textContent = status;
}

/**
 * 更新同步狀態顯示
 * @param {string} status - 同步狀態 (同步中/成功/失敗)
 */
function updateSyncStatus(status) {
    document.getElementById('syncStatus').textContent = `同步狀態: ${status}`;
    console.log('[GUN] 同步狀態:', status);
}

/**
 * 生成分享連結
 * @returns {string} 分享 URL
 */
function generateShareLink() {
    const baseUrl = window.location.origin + window.location.pathname;
    // 未來可擴充：加入 GUN 節點識別碼
    const shareUrl = baseUrl + '?gun-path=ParkRelief/painEvents';
    console.log('[Share] 已生成分享連結:', shareUrl);
    return shareUrl;
}

// ============================================
// 4. 計時器管理
// ============================================

/**
 * 啟動倒數計時
 */
function startTimer() {
    if (AppState.timerInterval) {
        clearInterval(AppState.timerInterval);
    }

    // 先更新一次顯示（立即反映選定的時間）
    updateTimerDisplay();

    AppState.timerInterval = setInterval(() => {
        if (AppState.isRunning) {
            AppState.currentDuration--;
            updateTimerDisplay();

            // 時間到自動停止
            if (AppState.currentDuration <= 0) {
                stopTimer();
                toggleMassageStatus('stop');
                console.log('[Timer] 時間已到，自動停止');
            }
        }
    }, 1000);
}

/**
 * 停止計時
 */
function stopTimer() {
    if (AppState.timerInterval) {
        clearInterval(AppState.timerInterval);
        AppState.timerInterval = null;
    }
    updateTimerDisplay();
}

/**
 * 更新計時器顯示 (MM:SS 格式)
 */
function updateTimerDisplay() {
    const minutes = Math.floor(AppState.currentDuration / 60);
    const seconds = AppState.currentDuration % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    document.getElementById('timer').textContent = timeStr;
}

// ============================================
// 5. 事件處理函式
// ============================================

/**
 * 處理「開始按摩」按鈕點擊
 */
function handleStartMassage() {
    console.log('[Handler] 按摩開始');
    toggleMassageStatus('start');
}

/**
 * 處理「停止按摩」按鈕點擊
 */
function handleStopMassage() {
    console.log('[Handler] 按摩停止');
    toggleMassageStatus('stop');
}

/**
 * 處理「儲存紀錄」按鈕點擊
 */
function handleSaveRecord() {
    console.log('[Handler] 儲存紀錄');

    const area = document.getElementById('painArea').value;
    const intensity = document.getElementById('intensity').value;
    const duration = AppState.totalDuration; // 使用啟動時的時間
    const notes = document.getElementById('notes').value;

    // 建立事件物件
    const event = createPainEvent(area, intensity, duration, notes);
    console.log('[Event] 已建立事件:', event);

    // 儲存到 GUN
    saveToGUN(event)
        .then(() => {
            console.log('[Success] 事件已儲存');
            // 刷新紀錄顯示
            loadEventsFromGUN();
            // 清空備註欄位
            document.getElementById('notes').value = '';
        })
        .catch((error) => {
            console.error('[Error] 儲存失敗:', error);
            alert('儲存失敗，請檢查網路連線');
        });
}

/**
 * 從 GUN 載入並顯示事件
 */
function loadEventsFromGUN() {
    console.log('[Handler] 載入事件');

    loadFromGUN()
        .then((events) => {
            displayEvents(events);
        })
        .catch((error) => {
            console.error('[Error] 載入失敗:', error);
        });
}

/**
 * 在頁面上顯示事件清單
 * @param {Array} events - 事件陣列
 */
function displayEvents(events) {
    const eventListEl = document.getElementById('eventList');

    if (!events || events.length === 0) {
        eventListEl.innerHTML = '<p class="placeholder">暫無紀錄</p>';
        return;
    }

    // 按時間戳排序（新到舊）
    events.sort((a, b) => b.timestamp - a.timestamp);

    // 產生 HTML
    const eventsHTML = events.map((event) => `
        <div class="event-item">
            <div class="event-time">
                📅 ${event.timestampStr || new Date(event.timestamp).toLocaleString('zh-TW')}
            </div>
            <div class="event-details">
                <div class="event-detail">
                    <span class="event-detail-label">部位:</span>
                    <span class="event-detail-value">${event.painArea}</span>
                </div>
                <div class="event-detail">
                    <span class="event-detail-label">強度:</span>
                    <span class="event-detail-value">${event.intensity} / 10</span>
                </div>
                <div class="event-detail">
                    <span class="event-detail-label">時間:</span>
                    <span class="event-detail-value">${event.duration} 分鐘</span>
                </div>
                <div class="event-detail">
                    <span class="event-detail-label">狀態:</span>
                    <span class="event-detail-value">${event.syncStatus}</span>
                </div>
            </div>
            ${event.notes ? `<div class="event-notes">💬 ${event.notes}</div>` : ''}
        </div>
    `).join('');

    eventListEl.innerHTML = eventsHTML;
    console.log('[UI] 已顯示', events.length, '個事件');
}

/**
 * 打開分享模態框
 */
function handleOpenShareModal() {
    console.log('[Handler] 打開分享模態框');
    const shareLink = generateShareLink();
    document.getElementById('shareLink').value = shareLink;
    document.getElementById('shareModal').classList.remove('hidden');
}

/**
 * 複製分享連結到剪貼板
 */
function handleCopyShareLink() {
    const shareLinkInput = document.getElementById('shareLink');
    shareLinkInput.select();
    document.execCommand('copy');
    console.log('[Share] 已複製連結到剪貼板');
    alert('連結已複製！可以分享給家人');
}

/**
 * 關閉分享模態框
 */
function handleCloseShareModal() {
    console.log('[Handler] 關閉分享模態框');
    document.getElementById('shareModal').classList.add('hidden');
}

/**
 * 更新調試資訊
 */
function updateDebugInfo() {
    const debugInfo = `GUN: ${AppState.gun ? '✓ 已連接' : '✗ 未連接'}`;
    document.getElementById('debugInfo').textContent = debugInfo;
}

// ============================================
// 6. 應用啟動
// ============================================

/**
 * 頁面載入完成後初始化應用
 */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
