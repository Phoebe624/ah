/**
 * ParkRelief 單元測試
 * 
 * 測試框架：Mocha + Chai（CDN 版本）
 * 執行方式：在瀏覽器打開 tests.html
 * 
 * TDD 流程示範：
 * 1. 先寫測試（期望失敗 - 紅色）
 * 2. 實作程式碼使測試通過（綠色）
 * 3. 重構與優化（保持綠色）
 */

// ============================================
// 測試套組 1: 建立事件物件
// ============================================

describe('PainEvent 物件建立', function() {
    it('應建立正確的事件結構', function() {
        // Arrange: 準備測試資料
        const area = '腰部';
        const intensity = 7;
        const duration = 15;
        const notes = '按摩後感覺好多了';

        // Act: 執行被測函式
        const event = createPainEvent(area, intensity, duration, notes);

        // Assert: 驗證結果
        expect(event).to.have.property('id');
        expect(event).to.have.property('timestamp');
        expect(event).to.have.property('painArea');
        expect(event).to.have.property('intensity');
        expect(event).to.have.property('duration');
        expect(event).to.have.property('notes');
        expect(event).to.have.property('syncStatus');
    });

    it('事件的痛點部位應正確設定', function() {
        const event = createPainEvent('背部', 5, 10, '輕度疼痛');
        expect(event.painArea).to.equal('背部');
    });

    it('事件的強度應為數字型態', function() {
        const event = createPainEvent('肩頸', '6', 12, '');
        expect(event.intensity).to.be.a('number');
        expect(event.intensity).to.equal(6);
    });

    it('事件的強度應在 1-10 範圍內', function() {
        const event1 = createPainEvent('腰部', 1, 15, '');
        const event2 = createPainEvent('背部', 10, 15, '');
        expect(event1.intensity).to.be.within(1, 10);
        expect(event2.intensity).to.be.within(1, 10);
    });

    it('事件強度超過 10 應自動限制為 10', function() {
        const event = createPainEvent('腰部', 15, 15, '');
        expect(event.intensity).to.equal(10);
    });

    it('事件強度低於 1 應自動提升為 1', function() {
        const event = createPainEvent('腰部', 0, 15, '');
        expect(event.intensity).to.equal(1);
    });

    it('事件時間應為正整數', function() {
        const event = createPainEvent('腰部', 5, 15.7, '');
        expect(event.duration).to.be.a('number');
        expect(event.duration).to.equal(15);
    });

    it('事件時間戳應是有效的 Unix 時間戳', function() {
        const event = createPainEvent('腰部', 5, 15, '');
        expect(event.timestamp).to.be.a('number');
        expect(event.timestamp).to.be.greaterThan(0);
        expect(event.timestamp).to.be.closeTo(Date.now(), 1000); // 誤差 1 秒內
    });

    it('事件 ID 應包含時間戳且唯一', function() {
        const event1 = createPainEvent('腰部', 5, 15, '');
        setTimeout(() => {
            const event2 = createPainEvent('腰部', 5, 15, '');
            expect(event1.id).to.not.equal(event2.id);
        }, 10);
    });

    it('事件備註應為字串型態', function() {
        const event = createPainEvent('腰部', 5, 15, '測試備註');
        expect(event.notes).to.be.a('string');
        expect(event.notes).to.equal('測試備註');
    });

    it('事件備註為選填，預設值應為空字串', function() {
        const event = createPainEvent('腰部', 5, 15);
        expect(event.notes).to.equal('');
    });
});

// ============================================
// 測試套組 2: GUN 儲存與讀取
// ============================================

describe('GUN 同步功能', function() {
    it('應正確初始化 GUN', function() {
        // AppState.gun 應在 app.js 初始化時已建立
        expect(AppState).to.exist;
        expect(AppState.gun).to.exist;
    });

    it('saveToGUN 應回傳 Promise', function() {
        const event = createPainEvent('腰部', 5, 15, '測試');
        const result = saveToGUN(event);
        expect(result).to.be.a('Promise');
    });

    it('saveToGUN 應成功儲存事件', function(done) {
        const event = createPainEvent('腰部', 5, 15, '測試儲存');
        
        saveToGUN(event)
            .then((savedEvent) => {
                expect(savedEvent).to.exist;
                expect(savedEvent.id).to.equal(event.id);
                done();
            })
            .catch((error) => {
                done(error);
            });
    });

    it('loadFromGUN 應回傳 Promise', function() {
        const result = loadFromGUN();
        expect(result).to.be.a('Promise');
    });

    it('loadFromGUN 應回傳事件陣列', function(done) {
        loadFromGUN()
            .then((events) => {
                expect(events).to.be.an('array');
                done();
            })
            .catch((error) => {
                done(error);
            });
    });

    it('儲存事件後應能讀取', function(done) {
        this.timeout(5000); // 允許 5 秒等待
        
        const testEvent = createPainEvent('背部', 7, 20, '測試讀寫一致性');
        
        saveToGUN(testEvent)
            .then(() => {
                return loadFromGUN();
            })
            .then((events) => {
                // 檢查是否存在該事件（根據 ID）
                const found = events.find(e => e.id === testEvent.id);
                expect(found).to.exist;
                expect(found.painArea).to.equal('背部');
                expect(found.intensity).to.equal(7);
                done();
            })
            .catch((error) => {
                done(error);
            });
    });
});

// ============================================
// 測試套組 3: UI 狀態管理
// ============================================

describe('UI 狀態切換', function() {
    beforeEach(function() {
        // 每個測試前重設狀態
        AppState.isRunning = false;
        document.getElementById('status').textContent = '未啟動';
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
    });

    it('toggleMassageStatus("start") 應啟動按摩', function() {
        toggleMassageStatus('start');
        expect(AppState.isRunning).to.be.true;
        expect(document.getElementById('status').textContent).to.include('按摩中');
    });

    it('按摩啟動時「開始」按鈕應被禁用', function() {
        toggleMassageStatus('start');
        expect(document.getElementById('startBtn').disabled).to.be.true;
    });

    it('按摩啟動時「停止」按鈕應可用', function() {
        toggleMassageStatus('start');
        expect(document.getElementById('stopBtn').disabled).to.be.false;
    });

    it('toggleMassageStatus("stop") 應停止按摩', function() {
        toggleMassageStatus('start');
        toggleMassageStatus('stop');
        expect(AppState.isRunning).to.be.false;
        expect(document.getElementById('status').textContent).to.include('已停止');
    });

    it('按摩停止時「開始」按鈕應可用', function() {
        toggleMassageStatus('start');
        toggleMassageStatus('stop');
        expect(document.getElementById('startBtn').disabled).to.be.false;
    });

    it('按摩停止時「停止」按鈕應被禁用', function() {
        toggleMassageStatus('start');
        toggleMassageStatus('stop');
        expect(document.getElementById('stopBtn').disabled).to.be.true;
    });

    it('按摩啟動時應禁用「儲存」按鈕', function() {
        toggleMassageStatus('start');
        expect(document.getElementById('saveBtn').disabled).to.be.true;
    });

    it('按摩停止時應啟用「儲存」按鈕', function() {
        toggleMassageStatus('start');
        toggleMassageStatus('stop');
        expect(document.getElementById('saveBtn').disabled).to.be.false;
    });

    it('updateUIStatus 應更新狀態文字', function() {
        updateUIStatus('測試狀態');
        expect(document.getElementById('status').textContent).to.equal('測試狀態');
    });
});

// ============================================
// 測試套組 4: 計時器功能
// ============================================

describe('計時器功能', function() {
    beforeEach(function() {
        // 重設計時器
        if (AppState.timerInterval) {
            clearInterval(AppState.timerInterval);
        }
        AppState.currentDuration = 0;
        AppState.totalDuration = 0;
    });

    afterEach(function() {
        // 清理計時器
        if (AppState.timerInterval) {
            clearInterval(AppState.timerInterval);
        }
    });

    it('updateTimerDisplay 應以 MM:SS 格式顯示時間', function() {
        AppState.currentDuration = 65; // 1 分 5 秒
        updateTimerDisplay();
        expect(document.getElementById('timer').textContent).to.equal('01:05');
    });

    it('updateTimerDisplay 應處理 0 分鐘的情況', function() {
        AppState.currentDuration = 0;
        updateTimerDisplay();
        expect(document.getElementById('timer').textContent).to.equal('00:00');
    });

    it('updateTimerDisplay 應處理 59 分 59 秒的情況', function() {
        AppState.currentDuration = 59 * 60 + 59; // 59:59
        updateTimerDisplay();
        expect(document.getElementById('timer').textContent).to.equal('59:59');
    });
});

// ============================================
// 測試套組 5: 輔助函式
// ============================================

describe('輔助函式', function() {
    it('generateShareLink 應回傳字串', function() {
        const link = generateShareLink();
        expect(link).to.be.a('string');
    });

    it('generateShareLink 應包含基礎 URL', function() {
        const link = generateShareLink();
        expect(link).to.include(window.location.pathname);
    });

    it('generateShareLink 應包含 GUN 路徑參數', function() {
        const link = generateShareLink();
        expect(link).to.include('gun-path');
    });

    it('createPainEvent 應設定初始同步狀態為「新建」', function() {
        const event = createPainEvent('腰部', 5, 15, '');
        expect(event.syncStatus).to.equal('新建');
    });

    it('createPainEvent 應設定裝置狀態為「已停止」', function() {
        const event = createPainEvent('腰部', 5, 15, '');
        expect(event.deviceStatus).to.equal('已停止');
    });
});
