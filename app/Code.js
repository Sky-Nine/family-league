/**
 * 回傳升到 targetLevel 所需的累積 EXP（不存在 = 已滿級）
 */
function getExpForLevel_(targetLevel) {
  var table = {
    2:145,  3:310,  4:505,  5:725,  6:960,  7:1215, 8:1490, 9:1790, 10:2130,
    11:2355,12:2590,13:2840,14:3100,15:3365,16:3635,17:3920,
    18:4215,19:4525,20:4840,21:5160,22:5495,23:5835,24:6185,
    25:6550,26:6925,27:7310,28:7705,29:8110,30:8525
  };
  return table[targetLevel];
}

/**
 * 回傳指定等級的 Max SP（起始 Lv1 = 0，每次升級交替 +1, +2）
 * 公式：Max SP = floor(3 * (level - 1) / 2)
 */
function getMaxSpForLevel_(level) {
  if (level <= 1) return 0;
  return Math.floor(3 * (level - 1) / 2);
}

/**
 * 安全遷移：確保 sheet 存在並補上缺少的欄位，不動現有資料。
 * 回傳 { sheet, isNew } — isNew=true 代表此次執行才建立，可用來決定是否補種資料。
 */
function ensureSheet_(ss, name, headers) {
    const isNew = !ss.getSheetByName(name);
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);

    const existingHeaders = sheet.getLastRow() > 0
        ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String).filter(h => h !== '')
        : [];

    if (existingHeaders.length === 0) {
        sheet.appendRow(headers);
    } else {
        // 補上新版本新增的欄位（不動既有欄位順序）
        const missing = headers.filter(h => !existingHeaders.includes(h));
        if (missing.length > 0) {
            sheet.getRange(1, existingHeaders.length + 1, 1, missing.length).setValues([missing]);
            Logger.log(`📋 ${name}: 新增欄位 ${missing.join(', ')}`);
        }
    }
    return { sheet, isNew: isNew || sheet.getLastRow() <= 1 };
}

/**
 * 安全遷移：確保 Global_State 裡某個 key 存在，不覆蓋已有的值。
 */
function ensureStateKey_(sheet, key, defaultValue, description) {
    const data = sheet.getDataRange().getValues();
    const exists = data.some(row => String(row[0]) === key);
    if (!exists) {
        sheet.appendRow([key, defaultValue, description]);
        Logger.log(`🔑 Global_State: 新增 key "${key}"`);
    }
}

/**
 * 步驟 1：執行 setupSheets() 建立或遷移資料庫。
 * 冪等設計：可安全重複執行，不會清除任何現有資料。
 */
function setupSheets() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. Users
    const { sheet: usersSheet, isNew: usersNew } = ensureSheet_(ss, "Users",
        ["User_ID", "Name", "Account_Type", "PIN_Code", "Level", "EXP", "Gold", "Current_SP", "Max_SP", "Status", "Avatar_ID"]);
    if (usersNew) {
        usersSheet.appendRow(["P1",  "Sheldon",       "Player", "1111", 1,  0, 50, 0, 0, "Active", "p1_warrior"]);
        usersSheet.appendRow(["P2",  "Leonard",       "Player", "2222", 1,  0, 50, 0, 0, "Active", "p2_leonard"]);
        usersSheet.appendRow(["GM1", "裁判(家長)", "GM",     "9999", 99, 0,  0,   0,   0, "Active", ""]);
    }

    // 2. Global_State — 逐 key 補齊，不重置分數
    const { sheet: stateSheet } = ensureSheet_(ss, "Global_State", ["Key", "Value", "Description"]);
    ensureStateKey_(stateSheet, "Current_Season_ID", "S1_Regular", "賽季模式");
    ensureStateKey_(stateSheet, "Team_Score",        "0",          "我方分數週期累計");
    ensureStateKey_(stateSheet, "Monster_Score",     "0",          "怪獸分數週期累計");
    ensureStateKey_(stateSheet, "Daily_News",          "昨日戰報正在生成中...", "AI 戰報新聞稿");
    ensureStateKey_(stateSheet, "Daily_Flavor_Texts", "[]",                    "每日 AI 花絮文字 JSON 陣列");

    // 3. Tasks
    ensureSheet_(ss, "Tasks",
        ["Task_ID", "Assignee_ID", "Season_ID", "Task_Name", "Category", "Difficulty", "Base_EXP", "Base_Gold", "Status", "Deadline", "Created_At", "Completed_At", "Submitted_By"]);

    // 4. Skills_Dict
    const { sheet: skillsDictSheet, isNew: skillsDictNew } = ensureSheet_(ss, "Skills_Dict",
        ["Skill_ID", "Skill_Name", "SP_Cost", "Cooldown_Hours", "Effect_Type", "Description"]);
    if (skillsDictNew) {
        skillsDictSheet.appendRow(["S1", "壓哨三分", 40, 24, "Multiplier", "期限前完成分數加倍"]);
    }

    // 5. Player_Skills
    ensureSheet_(ss, "Player_Skills", ["Player_ID", "Skill_ID", "Skill_Level", "Last_Used_At"]);

    // 6. Logs
    ensureSheet_(ss, "Logs", ["Log_ID", "Timestamp", "Season_ID", "Actor_ID", "Action_Type", "Detail_JSON"]);

    // 7. Daily_Templates
    const { sheet: dailyTplSheet, isNew: dailyTplNew } = ensureSheet_(ss, "Daily_Templates",
        ["Template_ID", "Task_Name", "Time_Tag", "Difficulty", "Base_EXP", "Base_Gold", "Assignee_ID", "Trigger_Days"]);
    if (dailyTplNew) {
        dailyTplSheet.appendRow(["DT1",  "自己起床",         "Morning", "D", 10, 5,  "TEAM", "1,2,3,4,5"]);
        dailyTplSheet.appendRow(["DT2",  "刷牙",             "Morning", "E",  5, 2,  "TEAM", "0,1,2,3,4,5,6"]);
        dailyTplSheet.appendRow(["DT3",  "7:35前出門",       "Morning", "B", 30, 15, "TEAM", "1,2,3,4,5"]);
        dailyTplSheet.appendRow(["DT4",  "整理餐袋",         "Evening", "D", 10, 5,  "TEAM", "1,2,3,4,5"]);
        dailyTplSheet.appendRow(["DT5",  "寫作業",           "Evening", "C", 20, 10, "TEAM", "1,2,3,4,5"]);
        dailyTplSheet.appendRow(["DT6",  "洗澡刷牙",         "Evening", "E",  5, 2,  "TEAM", "0,1,2,3,4,5,6"]);
        dailyTplSheet.appendRow(["DT7",  "複習作業",         "Evening", "C", 20, 10, "TEAM", "1,2,3,4,5"]);
        dailyTplSheet.appendRow(["DT8",  "整理書包",         "Evening", "D", 10, 5,  "TEAM", "0,1,2,3,4,5"]);
        dailyTplSheet.appendRow(["DT9",  "倒垃圾",           "Evening", "D", 10, 5,  "TEAM", "0,1,2,3,4,5,6"]);
        dailyTplSheet.appendRow(["DT10", "9:30熄燈/9:45全暗","Evening", "B", 30, 15, "TEAM", "0,1,2,3,4"]);
    }

    // 8. Shop_Items
    const { sheet: shopSheet, isNew: shopNew } = ensureSheet_(ss, "Shop_Items",
        ["Item_ID", "Name", "Description", "Cost", "Theme", "Require_Approval"]);
    if (shopNew) {
        shopSheet.appendRow(["I001", "代領手遊獎勵",     "代登入遊戲拿好康",               25, "green",  true]);
        shopSheet.appendRow(["I002", "代掛機獎勵",       "含代領；代掛機累積資源",          30, "green",  true]);
        shopSheet.appendRow(["I003", "15 分鐘 3C 券",   "自由使用平板或看電視",           40, "blue",   true]);
        shopSheet.appendRow(["I004", "週末泡澡券",       "週五/六/日可用",                70, "yellow", true]);
    }

    // 9. News (Archive)
    ensureSheet_(ss, "News", ["Date", "Season_ID", "Content", "Type"]); // Type: Daily/Weekly

    // 10. Player_Streaks (每日 EOD 寫一筆，供 streak 連勝計算與回顧)
    ensureSheet_(ss, "Player_Streaks",
        ["Record_ID", "Player_ID", "Date", "Day_Of_Week", "Successes", "Failures", "Streak_Days"]);

    // 11. Redemptions (Shop購買待審核佇列)
    ensureSheet_(ss, "Redemptions", ["Redemption_ID", "Player_ID", "Item_Name", "Cost", "Status", "Season_ID", "Created_At", "Resolved_At"]);

    // 10. Weekly score keys (same Global_State sheet from step 2)
    ensureStateKey_(stateSheet, "Weekly_Team_Score", "0", "本週我方總分");
    ensureStateKey_(stateSheet, "Weekly_Monster_Score", "0", "本週怪獸總分");
    ensureStateKey_(stateSheet, "League_Opened", "false", "聯盟是否已完成開幕式（首週週報旗標）");

    Logger.log("✅ setupSheets 完成（專業解耦遷移模式）");
}

/**
 * [分析用] 讀取 Daily_Templates，計算每日平均 EXP/Gold（考慮 Trigger_Days）
 * 跑完後貼 log 給設計者，用來反推 EXP 曲線與商店價格
 */
function analyzeTaskEconomy() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Daily_Templates");
    if (!sheet) { Logger.log("Daily_Templates 不存在"); return; }

    const data = sheet.getDataRange().getValues();
    const h = data[0];
    const nameCol = h.indexOf("Task_Name");
    const diffCol = h.indexOf("Difficulty");
    const expCol  = h.indexOf("Base_EXP");
    const goldCol = h.indexOf("Base_Gold");
    const daysCol = h.indexOf("Trigger_Days");

    // 每天 (0=Sun … 6=Sat) 累加 EXP / Gold
    const dayExp  = [0,0,0,0,0,0,0];
    const dayGold = [0,0,0,0,0,0,0];

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row[nameCol]) continue;
        const exp  = Number(row[expCol])  || 0;
        const gold = Number(row[goldCol]) || 0;
        const days = String(row[daysCol]).split(',').map(d => parseInt(d.trim()));
        days.forEach(d => {
            if (d >= 0 && d <= 6) { dayExp[d] += exp; dayGold[d] += gold; }
        });
        Logger.log(`  ${row[nameCol]} (${row[diffCol]}): EXP=${exp} Gold=${gold} Days=[${days}]`);
    }

    const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    Logger.log('--- 各天任務總量 ---');
    let totalExp = 0, totalGold = 0;
    for (let d = 0; d < 7; d++) {
        Logger.log(`${DAY_NAMES[d]}: EXP=${dayExp[d]}, Gold=${dayGold[d]}`);
        totalExp += dayExp[d]; totalGold += dayGold[d];
    }

    const avgExp  = totalExp  / 7;
    const avgGold = totalGold / 7;
    Logger.log('--- 每日平均（7天均化）---');
    Logger.log(`平均 EXP/day (100%): ${avgExp.toFixed(1)}`);
    Logger.log(`平均 Gold/day (100%): ${avgGold.toFixed(1)}`);
    Logger.log(`平均 EXP/day @80%: ${(avgExp*0.8).toFixed(1)}`);
    Logger.log(`平均 Gold/day @80%: ${(avgGold*0.8).toFixed(1)}`);
    Logger.log('--- 設計試算 ---');
    Logger.log(`Lv1→10 目標 30 天 @80%：需總 EXP = ${(avgExp*0.8*30).toFixed(0)}`);
    Logger.log(`Lv10→30 目標 90 天 @80%：需總 EXP = ${(avgExp*0.8*90).toFixed(0)}`);
    Logger.log(`設計意圖 (2x3C + 20G存款)：3C 單張上限 = ${((avgGold*0.8-20)/2).toFixed(1)}G`);
}

/**
 * [手動執行一次] 依 Economy_System.md 重設商店物品（清除舊資料後重新寫入）
 */
function updateShopItems() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Shop_Items");
    if (!sheet) { Logger.log("❌ Shop_Items 不存在"); return; }

    // 清除舊資料（保留 header）
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();

    const items = [
        ["I001", "代領手遊獎勵",    "代登入遊戲拿好康",               25, "green",  true],
        ["I002", "代掛機獎勵",      "含代領；代掛機累積資源",          30, "green",  true],
        ["I003", "15 分鐘 3C 券",  "自由使用平板或看電視",           40, "blue",   true],
        ["I004", "週末泡澡券",      "週五/六/日可用",                70, "yellow", true],
    ];
    items.forEach(row => safeAppendRow(sheet, row));
    Logger.log(`✅ 商店更新完成，共 ${items.length} 項`);
}

/**
 * [手動執行一次] 依難度公式更新 Daily_Templates 的 EXP 和 Gold
 * E=5, D=10, C=18, B=28, A=45, S=70 (EXP=Gold)
 */
function updateTaskEconomy() {
    const FORMULA = { E: 5, D: 10, C: 18, B: 28, A: 45, S: 70 };
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Daily_Templates");
    if (!sheet) { Logger.log("❌ Daily_Templates 不存在"); return; }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const diffCol = headers.indexOf("Difficulty");
    const expCol  = headers.indexOf("Base_EXP");
    const goldCol = headers.indexOf("Base_Gold");

    if (diffCol < 0 || expCol < 0 || goldCol < 0) {
        Logger.log("❌ 找不到欄位 Difficulty/Base_EXP/Base_Gold");
        return;
    }

    let updated = 0;
    for (let i = 1; i < data.length; i++) {
        const diff = String(data[i][diffCol]).trim().toUpperCase();
        if (!FORMULA[diff]) continue;
        const val = FORMULA[diff];
        sheet.getRange(i + 1, expCol + 1).setValue(val);
        sheet.getRange(i + 1, goldCol + 1).setValue(val);
        Logger.log(`Row ${i + 1} ${data[i][0]} (${diff}): EXP=${val}, Gold=${val}`);
        updated++;
    }
    Logger.log(`✅ 完成，共更新 ${updated} 筆`);
}

/**
 * [手動執行一次] 設定系統自動排程觸發器
 */
function setupTriggers() {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(t => ScriptApp.deleteTrigger(t));
    
    // 每日凌晨 05:50 自動派發任務並重置分數
    ScriptApp.newTrigger("generateDailyTasks")
        .timeBased()
        .atHour(5)
        .nearMinute(50)
        .everyDays(1)
        .create();
        
    // 每日早上 06:00 自動結算戰報（結算昨日 06:00 ~ 今日 06:00）
    ScriptApp.newTrigger("dailyEODProcess")
        .timeBased()
        .atHour(6)
        .nearMinute(0)
        .everyDays(1)
        .create();
    
    Logger.log("✅ 自動排程觸發器設定完成！(任務刷新已改為 05:50)");
}


/**
 * [GAS 觸發條件] 每天凌晨定時執行，派發今日常態任務
 */
function generateDailyTasks() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const tplSheet = ss.getSheetByName("Daily_Templates");
    const tasksSheet = ss.getSheetByName("Tasks");
    const logsSheet = ss.getSheetByName("Logs");
    const seasonId = getGlobalState(ss, "Current_Season_ID") || "S1_Regular";
    
    // 0. 每日刷新時，只將「已過期」或「無期限的每日任務」標記為 Expired
    //    長期任務（Deadline 在未來）必須保留，不能誤刪！
    //    Completed 任務也在這時清空（無論有無期限，完成就算數了）
    const allTasks = getSheetDataAsJson(tasksSheet);
    const now = new Date();
    allTasks.forEach((t, i) => {
        if (t.Status === "Completed") {
            tasksSheet.getRange(i + 2, 9).setValue("Expired"); // 完成的任務隔日清空
        } else if (t.Status === "Pending" || t.Status === "Failed") {
            const hasDeadline = t.Deadline && String(t.Deadline).trim() !== "";
            const deadlinePassed = hasDeadline && new Date(t.Deadline) < now;
            const isDailyTask = !hasDeadline;
            if (isDailyTask || deadlinePassed) {
                tasksSheet.getRange(i + 2, 9).setValue("Expired");
            }
            // 有期限且期限未到的長期任務 → 繼續保留
        }
    });

    // 1. 每日刷新時，將分數與新聞稿歸零
    updateGlobalState(ss, "Team_Score", "0");
    updateGlobalState(ss, "Monster_Score", "0");
    updateGlobalState(ss, "Daily_News", "今日比賽剛開始，準備好大顯身手了嗎？");
    
    const todayDay = new Date().getDay().toString(); // 0(Sun) ~ 6(Sat)
    const tplData = getSheetDataAsJson(tplSheet);
    let count = 0;
    
    tplData.forEach(tpl => {
        const days = String(tpl.Trigger_Days).split(',');
        if (days.includes(todayDay)) {
            let displayTaskName = tpl.Task_Name;

            // 計算今日 Deadline（Time_Tag 為 GMT+8 時間，Sheets 可能傳 Date 物件）
            let deadlineISO = "";
            if (tpl.Time_Tag) {
                const timeTag = tpl.Time_Tag instanceof Date ? tpl.Time_Tag : new Date(`1970-01-01T${String(tpl.Time_Tag)}:00`);
                const hhmm = Utilities.formatDate(timeTag, "Asia/Taipei", "HH:mm");
                const taipeiDate = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
                deadlineISO = new Date(`${taipeiDate}T${hhmm}:00+08:00`).toISOString();
            }

            // 多指派玩家 → 各自獨立任務；TEAM → 單一任務
            const assigneeStr = String(tpl.Assignee_ID || '');
            const assigneeParts = assigneeStr.split(',').map(s => s.trim()).filter(s => s);
            const isTeamTpl = assigneeParts.includes('TEAM');
            const rowsToCreate = isTeamTpl ? ['TEAM'] : assigneeParts;

            rowsToCreate.forEach((assignee, idx) => {
                const newTaskId = "D" + new Date().getTime() + "_" + tpl.Template_ID + (rowsToCreate.length > 1 ? "_" + idx : "");
                safeAppendRow(tasksSheet, [
                    newTaskId,
                    assignee,
                    seasonId,
                    displayTaskName,
                    "Daily",
                    tpl.Difficulty,
                    tpl.Base_EXP,
                    tpl.Base_Gold,
                    "Pending",
                    deadlineISO,
                    new Date().toISOString(),
                    "",  // Completed_At
                    ""   // Submitted_By
                ]);
                safeAppendRow(logsSheet, [Utilities.getUuid(), new Date().toISOString(), seasonId, "SYSTEM", "TRIGGER_DAILY", JSON.stringify({ taskId: newTaskId, name: tpl.Task_Name, assignee })]);
                count++;
            });
        }
    });
    safeAppendRow(logsSheet, [Utilities.getUuid(), new Date().toISOString(), seasonId, "SYSTEM", "SCORE_RESET", JSON.stringify({ reason: "New Day" })]);

    Logger.log(`✅ 今日已自動派發 ${count} 個常駐任務，並重置每日賽果分數！`);
}

/**
 * [GAS 觸發條件] 每天早上 06:00 執行
 * 結算「前一天 06:00 到今天 06:00」的戰況
 */
function dailyEODProcess() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const seasonId = getGlobalState(ss, "Current_Season_ID") || "S1";
    
    // 判斷是否為週一 (1=Mon)
    const now = new Date();
    const isMonday = (now.getDay() === 1);
    
    const news = generateMatchReport(isMonday);
    
    // 1. 存檔到歷史紀錄 (News Sheet)
    const newsSheet = ss.getSheetByName("News");
    const dateStr = Utilities.formatDate(new Date(), "GMT+8", "yyyy-MM-dd");
    safeAppendRow(newsSheet, [dateStr, seasonId, news, isMonday ? "Weekly" : "Daily"]);

    // 2. 更新 Global_State 中的新聞稿
    updateGlobalState(ss, "Daily_News", news);

    // 3. 如果是週一，重置週得分（Team_Score 同步歸零，因為它就是週累計的前端顯示值）
    if (isMonday) {
        updateGlobalState(ss, "Weekly_Team_Score", "0");
        updateGlobalState(ss, "Weekly_Monster_Score", "0");
        updateGlobalState(ss, "Team_Score", "0");
        updateGlobalState(ss, "Monster_Score", "0");
        safeAppendRow(ss.getSheetByName("Logs"), [Utilities.getUuid(), new Date().toISOString(), seasonId, "SYSTEM", "WEEKLY_RESET", "Match Restarted"]);
    }

    // 5. 生成明日花絮文字（供前端跑馬燈使用）
    const flavorRaw = generateBroadcast_('DAILY_FLAVOR', {});
    if (flavorRaw) {
        const flavors = flavorRaw.split('\n').map(s => s.trim()).filter(s => s.length > 5);
        if (flavors.length >= 5) {
            updateGlobalState(ss, "Daily_Flavor_Texts", JSON.stringify(flavors.slice(0, 15)));
        }
    }

    Logger.log("✅ 結算與新聞稿存檔完成！");
}

/**
 * 聚合最近 24 小時 Log 並生成戰報
 */
function generateMatchReport(isWeekly = false) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logs = getSheetDataAsJson(ss.getSheetByName("Logs"));
    const users = getSheetDataAsJson(ss.getSheetByName("Users"));
    
    const now = new Date();
    const hoursToLookBack = isWeekly ? 168 : 24;
    const startTimeByMs = now.getTime() - (hoursToLookBack * 60 * 60 * 1000);
    
    const targetLogs = logs.filter(l => new Date(l.Timestamp).getTime() >= startTimeByMs);
    
    const logSummary = targetLogs.map(l => {
        const actor = users.find(u => u.User_ID === l.Actor_ID)?.Name || l.Actor_ID;
        const time = Utilities.formatDate(new Date(l.Timestamp), "GMT+8", "HH:mm");
        // 從 Detail_JSON 中提取簡易訊息
        let extra = "";
        try {
            const det = JSON.parse(l.Detail_JSON);
            extra = det.name || det.narrative || "";
        } catch(e){}
        return `[${time}] ${actor}: ${l.Action_Type} ${extra}`;
    }).join("\n");

    const teamScore = getGlobalState(ss, isWeekly ? "Weekly_Team_Score" : "Team_Score");
    const monsterScore = getGlobalState(ss, isWeekly ? "Weekly_Monster_Score" : "Monster_Score");

    const background = `背景設定：Sheldon（11歲）與 Leonard（8歲）是聯盟的 Noob 初心者球員，目前在 Phase 1，尚未擔任任何固定的籃球場上位置，一切都在學習中。對手是調皮的怪獸隊。`;
    const sharedRules = `不提及球場位置（如控球後衛、中鋒等）或 RPG 職業（如法師、戰士等），兩人目前是 Noob 初心者，無任何職業設定。正面鼓勵 Sheldon 與 Leonard，怪物則詼諧可愛。輸出純文字繁體中文，不要有任何 Markdown。`;

    // 正式戰況 = 有實際得分或犯規的事件
    const formalTypes = ['TASK_APPROVE', 'TASK_EXPIRED', 'FOUL_CALLED'];
    const formalLogs = targetLogs.filter(l => formalTypes.includes(l.Action_Type));
    const hasFormalEvents = formalLogs.length > 0;

    let prompt;
    if (isWeekly) {
        prompt = `你現在是「魔幻籃球聯盟」的專屬體育記者。請撰寫一篇【聯盟週報・賽事回顧】。
${background}
本週比分 - SL 隊：${teamScore} vs 怪獸：${monsterScore}。
本週日誌精華：\n${logSummary}\n
要求：篇幅約 500 字。完整回顧本週每天的重要事件與成長亮點，有起承轉合，像一篇真正的賽季週刊。生動幽默，融入 RPG 魔幻世界觀。${sharedRules}`;
    } else if (!hasFormalEvents) {
        // 無正式戰況，改用今日花絮改寫
        let flavorRaw = "";
        try {
            const flavorJson = getGlobalState(ss, "Daily_Flavor_Texts");
            const flavors = JSON.parse(flavorJson);
            if (Array.isArray(flavors) && flavors.length > 0) flavorRaw = flavors.join("\n");
        } catch(e) {}
        prompt = `你現在是「魔幻籃球聯盟」的專屬體育記者。今天沒有任何正式賽事，請根據以下球場花絮，撰寫一篇【賽事快報・休館日特輯】。
${background}
今日花絮素材：\n${flavorRaw || "球場一片安靜，連史萊姆都在打盹。"}\n
要求：篇幅約 250 字。用輕鬆幽默的語氣描繪球員備戰的日常，不要虛構正式比賽，但要有趣。${sharedRules}`;
    } else {
        prompt = `你現在是「魔幻籃球聯盟」的專屬體育記者。請撰寫一篇【賽事快報】。
${background}
今日比分 - SL 隊：${teamScore} vs 怪獸：${monsterScore}。
今日日誌：\n${logSummary}\n
要求：篇幅約 250 字，生動有力，涵蓋今日重要事件。生動幽默，融入 RPG 魔幻世界觀。${sharedRules}`;
    }

    try {
        if (targetLogs.length === 0 && isWeekly) {
            const leagueOpened = getGlobalState(ss, "League_Opened") || "false";
            let emptyPrompt;
            if (leagueOpened !== "true") {
                // 首次週報：聯盟開幕特輯
                emptyPrompt = `你現在是「魔幻籃球聯盟」的專屬體育記者。今天是聯盟的開幕日。請撰寫一篇約 200 字的【聯盟開幕特輯】，介紹這個充滿魔幻色彩的籃球世界，以及即將展開的傳說征途。語氣熱血幽默，融入 RPG 魔幻世界觀。\n${background}\n${sharedRules}`;
                updateGlobalState(ss, "League_Opened", "true");
            } else {
                // 空週：休季特輯
                emptyPrompt = `你現在是魔幻籃球聯盟記者。本週毫無賽事紀錄，請寫一段約 100 字幽默的『聯盟休季特輯』。\n${background}\n${sharedRules}`;
            }
            const emptyReport = callGemini_(emptyPrompt);
            updateGlobalState(ss, "Daily_News", emptyReport);
            return emptyReport;
        }

        const aiResponse = callGemini_(prompt);
        updateGlobalState(ss, "Daily_News", aiResponse);
        return aiResponse || "今日賽事雖然平靜，但球員們正蓄勢待發！";
    } catch (e) {
        console.error("Gemini Error:", e);
        return "新聞室突遭襲擊！(連線失敗)";
    }
}

/**
 * 掃描並處理過期任務：將 Pending 且超過 DeadLine 的改為 Failed，並給怪獸加分。
 */
function processExpiredTasks(ss) {
    const tasksSheet = ss.getSheetByName("Tasks");
    const tasks = getSheetDataAsJson(tasksSheet);
    const now = new Date();
    const seasonId = getGlobalState(ss, "Current_Season_ID") || "S1";
    
    let updated = false;
    tasks.forEach((t, index) => {
        if (t.Status === "Pending" && t.Deadline) {
            const dl = new Date(t.Deadline);
            if (dl < now) {
                const rowIndex = index + 2;
                tasksSheet.getRange(rowIndex, 9).setValue("Failed"); // Column 9: Status
                
                // 修改：根據難度動態計算給怪獸的分數 (與完成分數一致)
                let penaltyPoints = 1;
                const diff = (t.Difficulty || 'C').toUpperCase();
                if (diff === 'E') penaltyPoints = 1;
                else if (['D', 'C', 'B'].includes(diff)) penaltyPoints = 2;
                else if (['A', 'S'].includes(diff)) penaltyPoints = 3;

                addScore(ss, "Monster", penaltyPoints);
                
                // 🛡️ 不在 doGet 路徑呼叫 Gemini API，避免多筆過期任務造成 30 秒超時
                const narrative = `任務「${t.Task_Name}」超時未完成，怪獸隊發動快攻！(+${penaltyPoints}分)`;
                const expiredDetail = {
                    taskId: t.Task_ID,
                    name: t.Task_Name,
                    points: penaltyPoints,
                    actor: "怪獸隊",
                    narrative: narrative
                };
                safeAppendRow(ss.getSheetByName("Logs"), [
                    Utilities.getUuid(),
                    new Date().toISOString(),
                    seasonId,
                    "SYSTEM",
                    "TASK_EXPIRED",
                    JSON.stringify(expiredDetail)
                ]);
                updated = true;
            }
        }
    });
    return updated;
}

/**
 * 增加分數 Helper
 */
function addScore(ss, team, points) {
    const key = team === "Monster" ? "Monster_Score" : "Team_Score";
    const current = parseInt(getGlobalState(ss, key)) || 0;
    updateGlobalState(ss, key, (current + points).toString());
    
    // 同步更新週分數
    const weekKey = team === "Monster" ? "Weekly_Monster_Score" : "Weekly_Team_Score";
    const weekCurrent = parseInt(getGlobalState(ss, weekKey)) || 0;
    updateGlobalState(ss, weekKey, (weekCurrent + points).toString());
}

/**
 * 簡易 Gemini API 呼叫封裝
 */
function callGemini_(prompt) {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) return "提示：請在指令碼屬性中設定 GEMINI_API_KEY 才能啟用 AI 戰報功能。";

    // 自動降級模型清單：依序嘗試，哪個有額度就用哪個
    const models = [
        "gemma-3-27b-it",           // ✅ 已確認可用
        "gemini-2.0-flash",         // 備用（台灣可能無免費額度）
        "gemma-3-12b-it",           // 備用
        "gemma-3-4b-it"             // 最後備用
    ];

    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    for (const model of models) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const res = UrlFetchApp.fetch(url, { ...options });
        const statusCode = res.getResponseCode();

        if (statusCode === 200) {
            const json = JSON.parse(res.getContentText());
            if (json.candidates && json.candidates[0].content.parts[0].text) {
                Logger.log("✅ 使用模型: " + model);
                return json.candidates[0].content.parts[0].text;
            }
        } else if (statusCode === 429) {
            Logger.log("⏭️ 模型 " + model + " 額度已用完，嘗試下一個...");
            continue; // 嘗試下一個模型
        } else {
            Logger.log("❌ 模型 " + model + " 回傳錯誤 " + statusCode);
            continue;
        }
    }

    return "所有 AI 模型今日額度已用完，明天再來！";
}

/**
 * 生成單條戰況廣播文字（AI版）
 * type: 'TASK_APPROVE' | 'FOUL_CALLED'
 * 成功回傳字串，失敗回傳 null（讓前端 fallback 到 template）
 */
function generateBroadcast_(type, context) {
    let prompt = '';
    if (type === 'TASK_APPROVE') {
        const { playerName, taskName, difficulty, isHit, points, quality } = context;
        const diffLabel = { S: '傳說', A: '史詩', B: '稀有', C: '普通', D: '容易', E: '超簡單' }[difficulty] || difficulty;
        const outcomeStr = isHit ? `命中得 ${points} 分` : '未命中打鐵';
        const qualityHint = quality >= 99 ? '神乎其技、會心一投的超水準發揮'
            : quality >= 95 ? '手感絕佳、狀態火熱的高水準發揮'
            : quality >= 90 ? '穩定紮實、令人滿意的表現'
            : quality >= 80 ? '中規中矩、還算過得去的水準'
            : '勉強出手、有點搖晃的掙扎發揮';
        prompt = `你是魔幻籃球聯盟的搞笑主播，請用繁體中文寫一句廣播詞，25~40字，必須含一個emoji。
情境：菜鳥初心者${playerName}完成任務「${taskName}」（${diffLabel}難度），這次是${qualityHint}，結果${outcomeStr}。
要求：必須在廣播詞中提到任務「${taskName}」，並明確說出結果（${outcomeStr}）；用隱喻或氛圍詞暗示品質高低（不要說出品質百分比數字）；誇張好笑，善用籃球術語，不提球場位置或 RPG 職業，只輸出那一句話，不輸出任何其他文字。`;
    } else if (type === 'FOUL_CALLED') {
        const { targetName, points } = context;
        prompt = `你是家庭籃球聯盟的搞笑主播，請用繁體中文寫一句廣播詞，25~35字，必須含一個emoji。
情境：${targetName}被吹技術犯規，對手得${points}分。
要求：誇張好笑，善用籃球術語，只輸出那一句話，不輸出任何其他文字。`;
    } else if (type === 'TASK_EXPIRED') {
        const { taskName, points } = context;
        prompt = `你是家庭籃球聯盟的搞笑主播，請用繁體中文寫一句廣播詞，25~35字，必須含一個emoji。
情境：任務「${taskName}」超時未完成，怪獸隊發動快攻得${points}分。
要求：誇張好笑，善用籃球術語，只輸出那一句話，不輸出任何其他文字。`;
    } else if (type === 'DAILY_FLAVOR') {
        prompt = `你是魔幻籃球聯盟的搞笑場邊播報員，請用繁體中文生成15條球場花絮。
每條25~35字，必須含一個emoji，以🏟️開頭。
場景：Sheldon（11歲）與 Leonard（8歲）是尚未有固定球場位置的菜鳥初心者（Phase 1 Noob），對手是史萊姆、灰塵怪等可愛怪物。花絮要體現他們的成長與努力，不要提球場位置或 RPG 職業。
格式：每行一條，只輸出那15條，不輸出編號或其他文字。`;
    }
    if (!prompt) return null;
    try {
        const text = callGemini_(prompt);
        if (!text || text.includes('額度') || text.includes('API Key') || text.includes('明天再來')) return null;
        if (type === 'DAILY_FLAVOR') return text.trim();
        return text.trim().substring(0, 80);
    } catch (e) {
        return null;
    }
}

/**
 * ✅ 用於測試 Gemini API Key 是否正常工作 (在 GAS 編輯器選擇此函式手動執行)
 */
function testGeminiKey() {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    Logger.log("API Key 存在: " + (apiKey ? "✅ 是 (長度:" + apiKey.length + ")" : "❌ 否，請先設定"));
    if (!apiKey) return;

    // 測試所有可用的模型
    const testModels = [
        "gemini-2.5-flash-preview-04-17",
        "gemini-2.0-flash",
        "gemma-3-27b-it"
    ];

    for (const model of testModels) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const payload = { contents: [{ parts: [{ text: "請用繁體中文說：測試成功！" }] }] };
        const options = { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true };
        
        const response = UrlFetchApp.fetch(url, options);
        const statusCode = response.getResponseCode();
        Logger.log(`Model [${model}] → HTTP ${statusCode}`);
        
        if (statusCode === 200) {
            const json = JSON.parse(response.getContentText());
            Logger.log("✅ AI 回應: " + json.candidates[0].content.parts[0].text);
            return; // 找到可用模型，停止
        } else if (statusCode === 429) {
            Logger.log("⏭️ 額度不足 (limit=0)，測試下一個...");
        } else {
            Logger.log("❌ 錯誤: " + response.getContentText().substring(0, 200));
        }
    }
    Logger.log("❌ 所有模型都無可用額度，請確認 Key 是否為新 Project 的 Key");
}

/**
 * 步驟 2：API GET (獲取所有前端渲染需要的資料)
 */
function doGet(e) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 🛡️ 路由判斷：如果是 API 請求 (帶有 api=true)
    if (e && e.parameter && e.parameter.api === 'true') {
        const sheets = ss.getSheets();
        const usersSheet = sheets.find(s => s.getName().toUpperCase() === "USERS");
        
        if (!usersSheet) {
            return ContentService.createTextOutput(JSON.stringify({ error: "DB Error: [Users] sheet not found (case-insensitive)" }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        processExpiredTasks(ss);
        
        const rawUsers = getSheetDataAsJson(usersSheet);
        const usersData = rawUsers.map(u => {
            let safeUser = { ...u };
            delete safeUser["PIN_Code"];
            return safeUser;
        });

        const allLogs = getSheetDataAsJson(ss.getSheetByName("Logs"));
        const now = new Date();
        const todayStr = Utilities.formatDate(now, "GMT+8", "yyyy-MM-dd");
        
        let dailyLogs = allLogs.filter(l => {
            if (!l.Timestamp) return false;
            const logDateStr = Utilities.formatDate(new Date(l.Timestamp), "GMT+8", "yyyy-MM-dd");
            return logDateStr === todayStr;
        });

        const response = {
            users: usersData,
            globalState: getSheetDataAsJson(ss.getSheetByName("Global_State")),
            tasks: getSheetDataAsJson(ss.getSheetByName("Tasks")),
            playerSkills: getSheetDataAsJson(ss.getSheetByName("Player_Skills")),
            shopItems: getSheetDataAsJson(ss.getSheetByName("Shop_Items")),
            redemptions: getSheetDataAsJson(ss.getSheetByName("Redemptions")),
            news: getSheetDataAsJson(ss.getSheetByName("News")),
            dailyTemplates: getSheetDataAsJson(ss.getSheetByName("Daily_Templates")),
            logs: dailyLogs,
            timestamp: now.toISOString()
        };

        return ContentService.createTextOutput(JSON.stringify(response))
            .setMimeType(ContentService.MimeType.JSON);
    }
    
    // 🏠 預設行為：渲染網頁 UI (使用 Template 動態注入 API 網址)
    const template = HtmlService.createTemplateFromFile('app/index');
    template.webappUrl = ScriptApp.getService().getUrl();
    template.assetBase = 'https://cdn.jsdelivr.net/gh/Sky-Nine/family-league@main/';
    return template.evaluate()
        .setTitle('魔幻籃球聯盟 - Noob Camp' + (e.parameter.debug ? ' [DEBUG MODE]' : ''))
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        // 🛡️ IFRAME mode：停用 Caja HTML sanitizer，防止它截斷 JS template literal 裡的 </tag>
        .setSandboxMode(HtmlService.SandboxMode.IFRAME)
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 步驟 3：API POST (統一的 Action 處理中心)
 */
function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);
        const ss = SpreadsheetApp.getActiveSpreadsheet();

        const usersSheet = ss.getSheetByName("Users");
        const usersData = getSheetDataAsJson(usersSheet);
        const targetUserId = data.action === "login" ? data.userId : data.actorId;
        const user = usersData.find(u => u.User_ID === targetUserId);

        // 🛡️ API 1: 登入驗證 (Login)
        if (data.action === "login") {
            // 🛡️ 暴力破解防禦：隨機延遲 500~1500 毫秒
            Utilities.sleep(Math.floor(Math.random() * 1000) + 500);
            if (user && String(user.PIN_Code) === String(data.pin)) {
                let safeUser = { ...user };
                delete safeUser["PIN_Code"];
                return ContentService.createTextOutput(JSON.stringify({ success: true, user: safeUser }))
                    .setMimeType(ContentService.MimeType.JSON);
            } else {
                throw new Error("UNAUTHORIZED: Invalid Credentials");
            }
        }

        // 🛡️ API 2: 驗證後續所有 API 的 PIN 碼
        if (!user || String(user.PIN_Code) !== String(data.pin)) {
            throw new Error("UNAUTHORIZED: Invalid Token/PIN");
        }

        // 🛡️ API 3: 角色存取控制 (RBAC)
        const isGM = (user.Account_Type === 'GM');
        const isPlayer = (user.Account_Type === 'Player');
        
        const gmOnlyActions = ['approveTask', 'rejectTask', 'callFoul', 'quickAddTask', 'cancelTask', 'updateTask', 'addRoutine', 'updateRoutine', 'deleteRoutine', 'giveGift', 'approveRedemption', 'rejectRedemption'];
        if (gmOnlyActions.includes(data.action) && !isGM) {
            throw new Error("FORBIDDEN: GM Role Required");
        }

        const playerOnlyActions = ['submitTask', 'undoTask', 'redeemReward'];
        if (playerOnlyActions.includes(data.action) && !isPlayer) {
            throw new Error("FORBIDDEN: Player Role Required");
        }

        // 🛡️ API 4: Action 白名單 — 未知 action 直接拒絕，不浪費 Lock 資源
        const allValidActions = [...gmOnlyActions, ...playerOnlyActions];
        if (!allValidActions.includes(data.action)) {
            throw new Error("INVALID_ACTION: Unknown action '" + String(data.action).substring(0, 30) + "'");
        }

        // 🛡️ 併發競爭條件 (Race Condition) 鎖定保護：驗證完畢後，只將寫入事件上鎖
        const lock = LockService.getScriptLock();
        lock.waitLock(10000);
        let returnPayload = { success: true };
        
        try {
            const tasksSheet = ss.getSheetByName("Tasks");
            const logsSheet = ss.getSheetByName("Logs");
            const seasonId = getGlobalState(ss, "Current_Season_ID") || "Default";

            // 動作：小孩提交任務 (Pending -> Reviewing, TEAM 需全員提交)
            if (data.action === "submitTask") {
                const rows = tasksSheet.getDataRange().getValues();
                const tHeaders = rows[0];
                const submittedByCol = tHeaders.indexOf("Submitted_By"); // 動態查欄位，避免遷移問題
                for (let i = 1; i < rows.length; i++) {
                    if (rows[i][0] === data.taskId) {
                        const assignees = String(rows[i][1]).split(',');
                        const isTeam = assignees.includes('TEAM');
                        if (!isTeam && !assignees.includes(data.actorId)) {
                            throw new Error("FORBIDDEN: This task does not belong to you.");
                        }
                        if (rows[i][8] !== "Pending") {
                            throw new Error("INVALID_STATE: Task is not in Pending state.");
                        }
                        if (isTeam && submittedByCol >= 0) {
                            // TEAM 任務：記錄提交者，全員到齊才進 Reviewing
                            const playerIds = usersData.filter(u => u.Account_Type === 'Player').map(u => u.User_ID);
                            const existing = String(rows[i][submittedByCol] || '').split(',').filter(x => x);
                            if (!existing.includes(data.actorId)) existing.push(data.actorId);
                            tasksSheet.getRange(i + 1, submittedByCol + 1).setValue(existing.join(','));
                            const allIn = playerIds.every(pid => existing.includes(pid));
                            if (allIn) {
                                const submitTime = new Date().toISOString();
                                tasksSheet.getRange(i + 1, 9).setValue("Reviewing");
                                tasksSheet.getRange(i + 1, 12).setValue(submitTime); // Completed_At = 提交時間
                                safeAppendRow(logsSheet, [Utilities.getUuid(), submitTime, seasonId, data.actorId, "TASK_SUBMIT", JSON.stringify({ taskId: data.taskId, teamComplete: true })]);
                            } else {
                                safeAppendRow(logsSheet, [Utilities.getUuid(), new Date().toISOString(), seasonId, data.actorId, "TASK_PARTIAL_SUBMIT", JSON.stringify({ taskId: data.taskId, submittedBy: existing })]);
                            }
                        } else {
                            // 個人任務：直接進 Reviewing
                            const submitTime = new Date().toISOString();
                            tasksSheet.getRange(i + 1, 9).setValue("Reviewing");
                            tasksSheet.getRange(i + 1, 12).setValue(submitTime); // Completed_At = 提交時間
                            safeAppendRow(logsSheet, [Utilities.getUuid(), submitTime, seasonId, data.actorId, "TASK_SUBMIT", JSON.stringify({ taskId: data.taskId })]);
                        }
                        break;
                    }
                }
            }

            // 動作：小孩撤回任務 (Reviewing -> Pending，或 TEAM 部分提交撤回)
            if (data.action === "undoTask") {
                const rows = tasksSheet.getDataRange().getValues();
                const tHeaders = rows[0];
                const submittedByCol = tHeaders.indexOf("Submitted_By");
                for (let i = 1; i < rows.length; i++) {
                    if (rows[i][0] === data.taskId) {
                        const assignees = String(rows[i][1]).split(',');
                        const isTeam = assignees.includes('TEAM');
                        if (!isTeam && !assignees.includes(data.actorId)) {
                            throw new Error("FORBIDDEN: This task does not belong to you.");
                        }
                        const status = rows[i][8];
                        // TEAM 任務在 Pending 且玩家已部分提交 → 撤回部分提交
                        if (isTeam && status === "Pending" && submittedByCol >= 0) {
                            const existing = String(rows[i][submittedByCol] || '').split(',').filter(x => x);
                            const idx = existing.indexOf(data.actorId);
                            if (idx < 0) throw new Error("INVALID_STATE: You have not submitted this task.");
                            existing.splice(idx, 1);
                            tasksSheet.getRange(i + 1, submittedByCol + 1).setValue(existing.join(','));
                            safeAppendRow(logsSheet, [Utilities.getUuid(), new Date().toISOString(), seasonId, data.actorId, "TASK_UNDO", JSON.stringify({ taskId: data.taskId })]);
                        } else if (status === "Reviewing") {
                            tasksSheet.getRange(i + 1, 9).setValue("Pending");
                            // TEAM 任務退回時也撤掉 Submitted_By 裡的提交者
                            if (isTeam && submittedByCol >= 0) {
                                const existing = String(rows[i][submittedByCol] || '').split(',').filter(x => x);
                                const idx = existing.indexOf(data.actorId);
                                if (idx >= 0) existing.splice(idx, 1);
                                tasksSheet.getRange(i + 1, submittedByCol + 1).setValue(existing.join(','));
                            }
                            safeAppendRow(logsSheet, [Utilities.getUuid(), new Date().toISOString(), seasonId, data.actorId, "TASK_UNDO", JSON.stringify({ taskId: data.taskId })]);
                        } else {
                            throw new Error("INVALID_STATE: Cannot undo this task.");
                        }
                        break;
                    }
                }
            }

            // 動作：家長核准任務 (Reviewing -> Completed)
            if (data.action === "approveTask") {
                const rows = tasksSheet.getDataRange().getValues();
                for (let i = 1; i < rows.length; i++) {
                    if (rows[i][0] === data.taskId) {
                        if (rows[i][8] !== "Reviewing") {
                            throw new Error("INVALID_STATE: Task is not in Reviewing state.");
                        }
                        tasksSheet.getRange(i + 1, 9).setValue("Completed");

                        const expReward = parseInt(rows[i][6]) || 0;
                        const goldReward = parseInt(rows[i][7]) || 0;  // rows[i][6]=Base_EXP, rows[i][7]=Base_Gold
                        const difficulty = rows[i][5] || 'D';
                        const assigneeStr = rows[i][1];

                        const assignees = assigneeStr.split(',');
                        const userRows = usersSheet.getDataRange().getValues();
                        for (let u = 1; u < userRows.length; u++) {
                            const uid = userRows[u][0];
                            const accountType = userRows[u][2];
                            if (accountType !== 'Player') continue; // GM 不拿 EXP/Gold
                            if (!assignees.includes(uid) && !assignees.includes('TEAM')) continue;
                            const currentExp = parseInt(userRows[u][5]) || 0;
                            const currentGold = parseInt(userRows[u][6]) || 0;
                            const newExp = currentExp + expReward;
                            usersSheet.getRange(u + 1, 6).setValue(newExp);
                            usersSheet.getRange(u + 1, 7).setValue(currentGold + goldReward);
                            // Level-up check
                            const currentLevel = parseInt(userRows[u][4]) || 1;
                            let newLevel = currentLevel;
                            while (newLevel < 30 && getExpForLevel_(newLevel + 1) !== undefined && newExp >= getExpForLevel_(newLevel + 1)) {
                                newLevel++;
                            }
                            if (newLevel > currentLevel) {
                                usersSheet.getRange(u + 1, 5).setValue(newLevel);
                                // SP Max 隨等級提升：+1/+2 交替，公式 = floor(3*(Lv-1)/2)
                                const newMaxSp = getMaxSpForLevel_(newLevel);
                                usersSheet.getRange(u + 1, 9).setValue(newMaxSp);
                                safeAppendRow(logsSheet, [Utilities.getUuid(), new Date().toISOString(), seasonId, uid, "LEVEL_UP", JSON.stringify({ from: currentLevel, to: newLevel, totalExp: newExp, maxSp: newMaxSp })]);
                                if (!returnPayload.levelUps) returnPayload.levelUps = [];
                                returnPayload.levelUps.push({ userId: uid, name: userRows[u][1], from: currentLevel, to: newLevel, maxSp: newMaxSp });
                            }
                        }

                        // 命中判定（修正邏輯：E=1, D/C/B=2, A/S=3+與自定義）
                        const quality = data.quality !== undefined ? parseInt(data.quality) : 100;
                        const roll = Math.random() * 100;
                        const isHit = roll <= quality;
                        let pointsGained = 0;

                        if (isHit) {
                            if (difficulty === 'E') pointsGained = 1;
                            else if (['D', 'C', 'B'].includes(difficulty)) pointsGained = 2;
                            else if (['A', 'S'].includes(difficulty)) {
                                // A/S 級任務賦予特殊搞笑加分
                                pointsGained = data.customPoints ? parseInt(data.customPoints) : 3;
                            }
                            
                            addScore(ss, "Team", pointsGained);
                        }

                        returnPayload.isHit = isHit;
                        returnPayload.points = pointsGained;

                        let flavorLabel = "TASK_APPROVE";
                        if (pointsGained >= 5) {
                            flavorLabel = "AWESOME_MOVE"; // 觸發特殊戰報字眼
                        }

                        const taskName = rows[i][3];
                        const playerNames = assigneeStr === 'TEAM'
                            ? '全隊'
                            : assignees.map(aid => usersData.find(u => u.User_ID === aid)?.Name || aid).join('、');
                        const broadcast = generateBroadcast_('TASK_APPROVE', { playerName: playerNames, taskName, difficulty, isHit, points: pointsGained, quality });
                        const approveDetail = { taskId: data.taskId, exp: expReward, gold: goldReward, isHit, points: pointsGained };
                        if (broadcast) approveDetail.broadcast = broadcast;

                        safeAppendRow(logsSheet, [Utilities.getUuid(), new Date().toISOString(), seasonId, data.actorId, flavorLabel, JSON.stringify(approveDetail)]);
                        break;
                    }
                }
            }

            // 動作：家長退回任務 (Reviewing -> Pending)，清除 Submitted_By 讓全員重新提交
            if (data.action === "rejectTask") {
                const rows = tasksSheet.getDataRange().getValues();
                const tHeaders = rows[0];
                const submittedByCol = tHeaders.indexOf("Submitted_By");
                for (let i = 1; i < rows.length; i++) {
                    if (rows[i][0] === data.taskId) {
                        if (rows[i][8] !== "Reviewing") {
                            throw new Error("INVALID_STATE: Task is not in Reviewing state.");
                        }
                        tasksSheet.getRange(i + 1, 9).setValue("Pending");
                        if (submittedByCol >= 0) tasksSheet.getRange(i + 1, submittedByCol + 1).setValue(""); // 重置，讓全員重新提交
                        safeAppendRow(logsSheet, [Utilities.getUuid(), new Date().toISOString(), seasonId, data.actorId, "TASK_REJECT", JSON.stringify({ taskId: data.taskId })]);
                        break;
                    }
                }
            }

            // 動作：家長快捷新增任務 (Flash Task)
            if (data.action === "quickAddTask") {
                const safeTaskName = String(data.taskName || '').substring(0, 100);
                if (!safeTaskName) throw new Error("INVALID_INPUT: taskName is required.");
                const playerIds = usersData.filter(u => u.Account_Type === 'Player').map(u => u.User_ID);
                const validAssignees = [...playerIds, 'TEAM'];
                const requestedAssignees = String(data.assigneeId || '').split(',');
                if (!requestedAssignees.every(a => validAssignees.includes(a))) {
                    throw new Error("INVALID_INPUT: Invalid assigneeId.");
                }
                const safeExp = Math.min(Math.max(parseInt(data.exp) || 10, 1), 100);
                const safeGold = Math.min(Math.max(parseInt(data.gold) || 5, 1), 50);
                const safeDifficulty = ['S', 'A', 'B', 'C', 'D', 'E'].includes(data.difficulty) ? data.difficulty : 'C';
                const safeDeadline = data.deadline ? String(data.deadline).substring(0, 30) : '';
                // 多指派玩家 → 各自獨立任務；TEAM → 單一任務
                const isTeamAssign = requestedAssignees.includes('TEAM');
                const rowsToCreate = isTeamAssign ? ['TEAM'] : requestedAssignees;
                const createdIds = [];
                rowsToCreate.forEach(assignee => {
                    const newTaskId = "T" + Utilities.getUuid();
                    safeAppendRow(tasksSheet, [newTaskId, assignee, seasonId, safeTaskName, "Flash", safeDifficulty, safeExp, safeGold, "Pending", safeDeadline, new Date().toISOString(), "", ""]);
                    safeAppendRow(logsSheet, [Utilities.getUuid(), new Date().toISOString(), seasonId, data.actorId, "TASK_CREATED", JSON.stringify({ taskId: newTaskId, assignee })]);
                    createdIds.push(newTaskId);
                });
                const newTaskId = createdIds[0]; // 向前相容，returnPayload 用第一個 ID
            }

            // 動作：家長強制刪除任務 (Pending/Reviewing/Failed -> Deleted)
            if (data.action === "cancelTask") {
                const rows = tasksSheet.getDataRange().getValues();
                for (let i = 1; i < rows.length; i++) {
                    if (rows[i][0] === data.taskId) {
                        if (!["Pending", "Reviewing", "Failed"].includes(rows[i][8])) {
                            throw new Error("INVALID_STATE: Task cannot be deleted in current state.");
                        }
                        tasksSheet.getRange(i + 1, 9).setValue("Deleted");
                        safeAppendRow(logsSheet, [Utilities.getUuid(), new Date().toISOString(), seasonId, data.actorId, "TASK_CANCEL", JSON.stringify({ taskId: data.taskId })]);
                        break;
                    }
                }
            }

            // 動作：家長編輯已指派的任務 (Update Task)
            if (data.action === "updateTask") {
                const rows = tasksSheet.getDataRange().getValues();
                for (let i = 1; i < rows.length; i++) {
                    if (rows[i][0] === data.taskId) {
                        if (rows[i][8] !== "Pending") {
                            throw new Error("只能編輯尚未提交審核的任務。");
                        }
                        tasksSheet.getRange(i + 1, 4).setValue(data.taskName);
                        tasksSheet.getRange(i + 1, 6).setValue(data.difficulty);
                        tasksSheet.getRange(i + 1, 7).setValue(parseInt(data.exp));
                        tasksSheet.getRange(i + 1, 8).setValue(parseInt(data.gold));
                        safeAppendRow(logsSheet, [Utilities.getUuid(), new Date().toISOString(), seasonId, data.actorId, "TASK_UPDATE", JSON.stringify({ taskId: data.taskId })]);
                        break;
                    }
                }
            }

            // 動作：家長宣告技術犯規 (1, 2, 3, or Custom)
            if (data.action === "callFoul") {
                const points = parseInt(data.scorePoints) || 1;

                // 預設扣 G 對照：+1→-13G, +2→-20G, +3→-33G；自訂時使用 goldPenalty 欄位
                const FOUL_GOLD = { 1: 13, 2: 20, 3: 33 };
                const goldPenalty = data.goldPenalty !== undefined
                    ? Math.abs(parseInt(data.goldPenalty) || 0)
                    : (FOUL_GOLD[points] || 0);

                // 更新怪獸分數
                addScore(ss, "Monster", points);

                const targetId = data.targetId || 'TEAM';
                let logType = "FOUL_CALLED";

                // 扣 Gold：指定個人扣全額；TEAM 則每位 Player 各扣全額（允許負數）
                const userRows = usersSheet.getDataRange().getValues();
                const goldCol = 6; // index 6 = column 7 = Gold
                const deductedPlayers = [];
                for (let u = 1; u < userRows.length; u++) {
                    if (userRows[u][2] !== 'Player') continue;
                    const uid = userRows[u][0];
                    if (targetId !== 'TEAM' && uid !== targetId) continue;
                    const newGold = (parseInt(userRows[u][goldCol]) || 0) - goldPenalty;
                    usersSheet.getRange(u + 1, goldCol + 1).setValue(newGold);
                    deductedPlayers.push({ userId: uid, name: userRows[u][1], goldDeducted: goldPenalty, newGold });
                }

                let detail = { addedPoints: points, targetId, goldPenalty, deductedPlayers };

                if (points === 4) {
                    logType = "MONSTER_AND1";
                } else if (points >= 5) {
                    logType = "MONSTER_RUN";
                }

                const foulTargetName = targetId === 'TEAM' ? '全隊' : (usersData.find(u => u.User_ID === targetId)?.Name || targetId);
                const foulBroadcast = generateBroadcast_('FOUL_CALLED', { targetName: foulTargetName, points });
                if (foulBroadcast) detail.broadcast = foulBroadcast;

                safeAppendRow(logsSheet, [Utilities.getUuid(), new Date().toISOString(), seasonId, data.actorId, logType, JSON.stringify(detail)]);

                returnPayload.goldPenalty = goldPenalty;
                returnPayload.deductedPlayers = deductedPlayers;
            }

            // 動作：直接送禮 (GM 超能力)
            if (data.action === "giveGift") {
                const targetId = data.targetId;
                const itemName = data.itemName;
                safeAppendRow(logsSheet, [Utilities.getUuid(), new Date().toISOString(), seasonId, data.actorId, "GM_GIFT", JSON.stringify({ targetId, itemName })]);
            }

            // 動作：新增日常例行公事 (Blank Template)
            if (data.action === "addRoutine") {
                let tplSheet = ss.getSheetByName("Daily_Templates");
                if (!tplSheet) {
                    tplSheet = ensureSheet_(ss, "Daily_Templates", ["Template_ID", "Task_Name", "Time_Tag", "Difficulty", "Base_EXP", "Base_Gold", "Assignee_ID", "Trigger_Days"]).sheet;
                }
                const newTplId = "DT" + new Date().getTime();
                safeAppendRow(tplSheet, [newTplId, "新例行任務", "08:00", "C", 15, 10, "TEAM", "0,1,2,3,4,5,6"]);
                safeAppendRow(logsSheet, [Utilities.getUuid(), new Date().toISOString(), seasonId, data.actorId, "ROUTINE_ADDED", JSON.stringify({ tplId: newTplId })]);
            }

            // 動作：更新日常例行公事 (Update Template)
            if (data.action === "updateRoutine") {
                const tplSheet = ss.getSheetByName("Daily_Templates");
                const rows = tplSheet.getDataRange().getValues();
                for (let i = 1; i < rows.length; i++) {
                    if (rows[i][0] === data.tplId) {
                        tplSheet.getRange(i + 1, 2).setValue(data.taskName);
                        tplSheet.getRange(i + 1, 3).setValue(data.timeTag);
                        tplSheet.getRange(i + 1, 4).setValue(data.difficulty);
                        tplSheet.getRange(i + 1, 5).setValue(parseInt(data.exp));
                        tplSheet.getRange(i + 1, 6).setValue(parseInt(data.gold));
                        tplSheet.getRange(i + 1, 7).setValue(data.assigneeId);
                        tplSheet.getRange(i + 1, 8).setValue(data.triggerDays || "0,1,2,3,4,5,6");
                        safeAppendRow(logsSheet, [Utilities.getUuid(), new Date().toISOString(), seasonId, data.actorId, "ROUTINE_UPDATED", JSON.stringify({ tplId: data.tplId })]);
                        break;
                    }
                }
            }

            // 動作：刪除日常例行公事模板
            if (data.action === "deleteRoutine") {
                const tplSheet = ss.getSheetByName("Daily_Templates");
                const rows = tplSheet.getDataRange().getValues();
                for (let i = 1; i < rows.length; i++) {
                    if (rows[i][0] === data.tplId) {
                        tplSheet.deleteRow(i + 1);
                        safeAppendRow(logsSheet, [Utilities.getUuid(), new Date().toISOString(), seasonId, data.actorId, "ROUTINE_DELETED", JSON.stringify({ tplId: data.tplId })]);
                        break;
                    }
                }
            }

            // 動作：玩家購買道具 (Server-Side Validation)
            if (data.action === "redeemReward") {
                const shopSheet = ss.getSheetByName("Shop_Items");
                const shopRows = shopSheet.getDataRange().getValues();
                let realCost = -1;
                let requireApproval = false;

                for (let i = 1; i < shopRows.length; i++) {
                    if (shopRows[i][1] === data.itemName) {
                        realCost = parseInt(shopRows[i][3]) || 0;
                        requireApproval = shopRows[i][5] === true || shopRows[i][5] === 'true' || shopRows[i][5] === 'TRUE';
                        break;
                    }
                }
                if (realCost < 0) throw new Error("商品不存在！");

                const userRows = usersSheet.getDataRange().getValues();
                let success = false;
                for (let u = 1; u < userRows.length; u++) {
                    if (userRows[u][0] === data.actorId) {
                        const currentGold = parseInt(userRows[u][6]) || 0;
                        if (currentGold < realCost) throw new Error("GOLD 不足，無法兌換！");
                        usersSheet.getRange(u + 1, 7).setValue(currentGold - realCost);

                        if (requireApproval) {
                            // 需審核：建立 Pending 紀錄，等 GM 決定
                            const redemptionSheet = ss.getSheetByName("Redemptions");
                            const rid = "R" + Utilities.getUuid();
                            safeAppendRow(redemptionSheet, [rid, data.actorId, data.itemName, realCost, "Pending", seasonId, new Date().toISOString(), ""]);
                            safeAppendRow(logsSheet, [Utilities.getUuid(), new Date().toISOString(), seasonId, data.actorId, "REDEMPTION_PENDING", JSON.stringify({ redemptionId: rid, itemName: data.itemName, cost: realCost })]);
                            returnPayload.requiresApproval = true;
                        } else {
                            // 免審核：直接完成
                            safeAppendRow(logsSheet, [Utilities.getUuid(), new Date().toISOString(), seasonId, data.actorId, "REWARD_REDEEMED", JSON.stringify({ itemName: data.itemName, cost: realCost })]);
                        }
                        success = true;
                        break;
                    }
                }
                if (!success) throw new Error("找不到該使用者帳號。");
            }

            // 動作：GM 核准兌換
            if (data.action === "approveRedemption") {
                const redemptionSheet = ss.getSheetByName("Redemptions");
                const rows = redemptionSheet.getDataRange().getValues();
                let found = false;
                for (let i = 1; i < rows.length; i++) {
                    if (rows[i][0] === data.redemptionId) {
                        if (rows[i][4] !== "Pending") throw new Error("INVALID_STATE: 不是 Pending 狀態。");
                        redemptionSheet.getRange(i + 1, 5).setValue("Approved");
                        redemptionSheet.getRange(i + 1, 8).setValue(new Date().toISOString());
                        safeAppendRow(logsSheet, [Utilities.getUuid(), new Date().toISOString(), seasonId, data.actorId, "REDEMPTION_APPROVED", JSON.stringify({ redemptionId: data.redemptionId, itemName: rows[i][2], playerId: rows[i][1] })]);
                        found = true;
                        break;
                    }
                }
                if (!found) throw new Error("找不到此兌換紀錄。");
            }

            // 動作：GM 拒絕兌換（退還金幣）
            if (data.action === "rejectRedemption") {
                const redemptionSheet = ss.getSheetByName("Redemptions");
                const rows = redemptionSheet.getDataRange().getValues();
                let found = false;
                for (let i = 1; i < rows.length; i++) {
                    if (rows[i][0] === data.redemptionId) {
                        if (rows[i][4] !== "Pending") throw new Error("INVALID_STATE: 不是 Pending 狀態。");
                        const playerId = rows[i][1];
                        const refundCost = parseInt(rows[i][3]) || 0;
                        // 退還金幣
                        const userRows = usersSheet.getDataRange().getValues();
                        for (let u = 1; u < userRows.length; u++) {
                            if (userRows[u][0] === playerId) {
                                usersSheet.getRange(u + 1, 7).setValue((parseInt(userRows[u][6]) || 0) + refundCost);
                                break;
                            }
                        }
                        redemptionSheet.getRange(i + 1, 5).setValue("Rejected");
                        redemptionSheet.getRange(i + 1, 8).setValue(new Date().toISOString());
                        safeAppendRow(logsSheet, [Utilities.getUuid(), new Date().toISOString(), seasonId, data.actorId, "REDEMPTION_REJECTED", JSON.stringify({ redemptionId: data.redemptionId, itemName: rows[i][2], playerId, refund: refundCost })]);
                        found = true;
                        break;
                    }
                }
                if (!found) throw new Error("找不到此兌換紀錄。");
            }

            return ContentService.createTextOutput(JSON.stringify(returnPayload))
                .setMimeType(ContentService.MimeType.JSON);

        } finally {
            lock.releaseLock();
        }
    } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

// 輔助函數：取得 JSON 陣列
function getSheetDataAsJson(sheet) {
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    const headers = data[0];
    const result = [];
    for (let i = 1; i < data.length; i++) {
        const rowData = {};
        for (let j = 0; j < headers.length; j++) {
            rowData[headers[j]] = data[i][j];
        }
        result.push(rowData);
    }
    return result;
}

// 輔助函數：生成幽默戰報日誌 (Flavor Log)
function generateFlavorLog() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const now = new Date();
    const hour = now.getHours(); // 24小時制
    
    // 定義安靜期 (0:00-7:00 及 9:00-16:00)
    const isQuietTime = (hour < 7) || (hour >= 9 && hour < 16) || (hour >= 22);
    if (isQuietTime) return; // 安靜期不產生幽默日誌
    
    const logsSheet = ss.getSheetByName("Logs");
    const seasonId = getGlobalState(ss, "Current_Season_ID") || "S1";
    
    const morningPhrases = [
        "Leonard 正在熱身，但他不小心把牛奶倒進球鞋裡了。",
        "裁判還在喝早餐咖啡，暫時沒看到腳踢球犯規。",
        "全隊士氣高漲，甚至有人提議早餐加蛋。"
    ];
    const eveningPhrases = [
        "怪獸隊在場邊偷偷吃零食，被裁判警告了。",
        "Sheldon 使出後場遠射，雖然沒進但球飛到了隔壁陽台。",
        "籃球架突然變成了巨大的花椰菜，全場陷入混亂。"
    ];
    
    const phrases = hour < 12 ? morningPhrases : eveningPhrases;
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    
    safeAppendRow(logsSheet, [
        Utilities.getUuid(), 
        now.toISOString(), 
        seasonId, 
        "SYSTEM", 
        "FLAVOR_LOG", 
        JSON.stringify({ text: phrase })
    ]);
}

// 🛡️ 輔助函數：安全寫入日誌 (防禦試算表公式注入攻擊)
function safeAppendRow(sheet, rowArgs) {
    const sanitize = (val) => (typeof val === 'string' && /^[=+\-@]/.test(val)) ? "'" + val : val;
    sheet.appendRow(rowArgs.map(sanitize));
}

// 輔助函數：取得 Global State 值
function getGlobalState(ss, key) {
    const sheet = ss.getSheetByName("Global_State");
    if (!sheet) return null;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        if (data[i][0] === key) return data[i][1];
    }
    return null;
}


function updateGlobalState(ss, key, val) {
    const sheet = ss.getSheetByName("Global_State");
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        if (data[i][0] === key) {
            sheet.getRange(i + 1, 2).setValue(val);
            return;
        }
    }
}

/**
 * [GAS 觸發條件] 每小時執行一次，檢查逾期任務
 * 如果任務逾期且未完成，怪獸隊得分
 */
function checkTaskDeadlines() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const tasksSheet = ss.getSheetByName("Tasks");
    const logsSheet = ss.getSheetByName("Logs");
    const seasonId = getGlobalState(ss, "Current_Season_ID") || "S1";
    
    const rows = tasksSheet.getDataRange().getValues();
    const now = new Date();
    let monsterPoints = 0;

    for (let i = 1; i < rows.length; i++) {
        const status = rows[i][8];
        const deadlineStr = rows[i][9];
        
        if (status === "Pending" && deadlineStr) {
            const deadline = new Date(deadlineStr);
            if (deadline < now) {
                // 任務超時！
                tasksSheet.getRange(i + 1, 9).setValue("Failed");
                
                const difficulty = rows[i][5];
                let points = 2; // 預設 2 分
                if (difficulty === 'E') points = 1;
                else if (['A', 'S'].includes(difficulty)) points = 3;
                
                monsterPoints += points;
                addScore(ss, "Monster", points);
                
                safeAppendRow(logsSheet, [Utilities.getUuid(), new Date().toISOString(), seasonId, "SYSTEM", "TASK_EXPIRED", JSON.stringify({ taskId: rows[i][0], taskName: rows[i][3], points: points })]);
            }
        }
    }
    
    if (monsterPoints > 0) {
        Logger.log(`🚨 檢查到逾期任務，怪獸隊共獲得 ${monsterPoints} 分！`);
    }
}