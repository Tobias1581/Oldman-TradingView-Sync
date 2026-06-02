// ==UserScript==
// @name         Oldman TradingView Sync & Export
// @version      4.04
// @description  Alarm Sync + cTrader Export/Import
// @author       Patrick Borger feat. Tobias Lorenz
// @match        https://*.tradingview.com/*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/Tobias1581/Oldman-TradingView-Sync/main/Oldman-TradingView-Sync.user.js
// @updateURL    https://raw.githubusercontent.com/Tobias1581/Oldman-TradingView-Sync/main/Oldman-TradingView-Sync.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================
    //  KONFIGURATION
    // ============================================================
    const STORAGE_KEY = 'oldman_strategy_to_alarm_settings';
    const DEBUG = true;
    // ============================================================
    //  SHARED HELPERS
    // ============================================================
    const clean = t => t?.trim().replace(/\s+/g, " ") || "";
    const log = (...args) => DEBUG && console.log('[Oldman Universal]', ...args);

    function num(v, d = 0) {
        if (v === undefined || v === null || v === "") return d;
        const n = parseFloat(String(v).replace(",", "."));
        return isNaN(n) ? d : n;
    }

    function splitPair(raw) {
        if (!raw || typeof raw !== "string") return { left: null, right: null };
        const parts = raw.split("/");
        if (parts.length === 1) {
            const v = num(parts[0], null);
            return { left: v, right: v };
        }
        return {
            left: num(parts[0], null),
            right: num(parts[1], null)
        };
    }

    const bool = v => v === true;

    function findLabelForControl(control, root) {
        if (control.type === "checkbox") {
            const lab = control.closest("label");
            if (lab) {
                const txt = clean(lab.innerText);
                if (txt) return txt;
            }
        }
        let cur = control.parentElement;
        while (cur && cur !== root) {
            const sib = cur.previousElementSibling;
            if (sib && !sib.querySelector("input, button[role='combobox']")) {
                const txt = clean(sib.innerText);
                if (txt) return txt;
            }
            cur = cur.parentElement;
        }
        return null;
    }

    function extractSettings(modal) {
        const settings = {};
        const controls = modal.querySelectorAll("input, button[role='combobox']");
        controls.forEach(control => {
            const label = findLabelForControl(control, modal);
            if (!label) return;
            let value;
            if (control.tagName === "INPUT") {
                value = control.type === "checkbox" ? control.checked : clean(control.value);
            } else if (control.tagName === "BUTTON") {
                value = clean(control.innerText);
            }
            if (value !== undefined) settings[label] = value;
        });
        log('Extracted settings:', settings);
        return settings;
    }

    function findControlByLabel(modal, labelText) {
        const controls = modal.querySelectorAll("input, button[role='combobox']");
        for (const control of controls) {
            const label = findLabelForControl(control, modal);
            if (label === labelText) {
                let parent = control.closest('[role="tabpanel"]');
                if (parent && parent.style.display === 'none') {
                    log(`Control "${labelText}" is in hidden tab, making visible...`);
                    const tabId = parent.getAttribute('id') || parent.getAttribute('aria-labelledby');
                    if (tabId) {
                        const tabButton = modal.querySelector(`[aria-controls="${tabId}"]`);
                        if (tabButton) {
                            log(`Clicking tab button for "${labelText}"`);
                            tabButton.click();
                        }
                    }
                }
                return control;
            }
        }
        return null;
    }

    // ============================================================
    //  ALARM SYNC - EXPORT FROM STRATEGY
    // ============================================================
    function exportStrategySettings(modal) {
        log("=== COPY TO ALARM START ===");
        const settings = extractSettings(modal);
        log(`Extracted ${Object.keys(settings).length} total settings from strategy modal`);

        const alarmSettings = {};

        const fieldsToExport = [
            // 01 - Basis
            "Oldman Gold Long ?",
            "Oldman Gold Short ?",
            "Regel 1L", "Regel 2L", "Regel 3L", "Regel 4L (200)", "Regel 4L (50)",
            "Regel 1S", "Regel 2S", "Regel 3S", "Regel 4S (200)", "Regel 4S (50)",
            "MA-Toleranz (Pts)",
            "Hammerdocht (%)",

            // 02 - Trade & CRV / SL
            "Trade-Richtung",
            "CRV Long", "CRV Short",
            "Entry-Offset (Pts)", "SL-Offset (Pts)",
            "SL Körper Long ?", "SL Körper Short ?",
            "Kerzenteilung Long ?", "Kerzenteilung Short ?",
            "Teilungsfaktor 1", "F2", "F3",
            "Schwelle 1 (Pts)", "S2", "S3",

            // 03 - Session
            "Session-Fenster",
            "Ausschlusszeiten Long", "Zeit Short",
            "Ausschlusstage Long", "Tage Short",

            // 05 - Kerzenform
            "Kerze min (Pts)", "Kerze max (Pts)",
            "Trend-Docht (%)", "Gegen-Docht (%)",
            "Körper min (%)", "Engulfing Growth (%)",

            // 06 - Trendfilter
            "Trendfilter Long ?", "Trendfilter Short ?",
            "MA Trend Long 1", "MA Trend Long 2", "MA Trend Long 3",
            "MA Trend Short 1", "MA Trend Short 2", "MA Trend Short 3",

            // 07 - Blockfilter
            "Blockfilter Long Mode", "MA Block Fast Long", "MA Block Slow Long",
            "Blockfilter Short Mode", "MA Block Fast Short", "MA Block Slow Short",

            // 08 - Indikatoren
            "RSI-Filter Long ?", "RSI-Filter Short ?", "RSI-Länge",
            "RSI Long: min", "RSI Long: max",
            "RSI Short: min", "RSI Short: max",
            "MACD-Filter Long ?", "MACD-Filter Short ?",
            "MACD-Fast", "MACD-Slow", "MACD-Signal",
            "StochRSI-Filter Long ?", "StochRSI-Filter Short ?",
            "SRSI Max (Long)", "SRSI Min (Short)"
        ];

        fieldsToExport.forEach(field => {
            if (settings[field] !== undefined) {
                alarmSettings[field] = settings[field];
            } else {
                log(`⚠ Field "${field}" not found in strategy settings`);
            }
        });

        localStorage.setItem(STORAGE_KEY, JSON.stringify(alarmSettings));
        log(`Saved ${Object.keys(alarmSettings).length} settings to localStorage`);

        const missing = fieldsToExport.filter(f => settings[f] === undefined);
        log(`Export Summary: ${Object.keys(alarmSettings).length} exported, ${missing.length} missing`);

        if (missing.length > 0) {
        }

        log("=== COPY TO ALARM COMPLETE ===");

        if (missing.length > 0) {
            alert(`Export abgeschlossen!\n\n✓ ${Object.keys(alarmSettings).length} Settings exportiert\n⚠ Nicht gefunden (${missing.length}):\n${missing.map(f => "  - " + f).join("\n")}`);
        }

        return Object.keys(alarmSettings).length;
    }

    // ============================================================
    //  ALARM SYNC - INPUT/COMBOBOX SETTERS
    // ============================================================
    async function setInputValue(input, value) {
        if (!input) return false;

        if (input.type === "checkbox") {
            const currentValue = input.checked;
            if (currentValue !== value) {
                const label = findLabelForControl(input, document);
                log(`Setting checkbox "${label}" from ${currentValue} to ${value}`);

                input.click();
                await new Promise(resolve => setTimeout(resolve, 60));

                if (input.checked !== value) {
                    log(`⚠ Checkbox click didn't work for "${label}", trying manual set`);
                    input.checked = value;
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                    log(`✓ Checkbox "${label}" set successfully`);
                }
            } else {
                log(`Checkbox "${findLabelForControl(input, document)}" already has correct value: ${value}`);
            }
            return true;
        }

        if (input.tagName === "INPUT") {
            const currentValue = input.value;
            const label = findLabelForControl(input, document);

            if (input.disabled) {
                log(`⚠ Input "${label}" is DISABLED - skipping`);
                return false;
            }
            if (input.readOnly) {
                log(`⚠ Input "${label}" is READONLY - skipping`);
                return false;
            }

            if (currentValue !== String(value)) {
                log(`Setting input "${label}" from "${currentValue}" to "${value}"`);

                input.focus();
                await new Promise(resolve => setTimeout(resolve, 50));

                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                nativeInputValueSetter.call(input, value);

                input.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(resolve => setTimeout(resolve, 30));

                input.dispatchEvent(new Event('change', { bubbles: true }));

                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));

                await new Promise(resolve => setTimeout(resolve, 50));
                input.blur();

                await new Promise(resolve => setTimeout(resolve, 100));
                const newValue = input.value;
                if (newValue === String(value)) {
                    log(`✓ Input "${label}" set successfully`);
                } else {
                    log(`⚠ Input "${label}" FAILED - tried to set "${value}" but value is still "${newValue}"`);
                }
            } else {
                log(`Input "${label}" already has correct value: "${value}"`);
            }
            return true;
        }

        return false;
    }

    async function setComboboxValue(button, value) {
        if (!button || button.getAttribute('role') !== 'combobox') return false;

        const currentText = clean(button.innerText);
        const label = findLabelForControl(button, document);

        if (currentText === value) {
            log(`Combobox "${label}" already has value "${value}"`);
            return true;
        }

        log(`Setting combobox "${label}" from "${currentText}" to "${value}"`);

        button.click();
        await new Promise(resolve => setTimeout(resolve, 150));

        const options = document.querySelectorAll('[role="option"]');
        let found = false;
        for (const option of options) {
            const optText = clean(option.innerText);

            if (optText === value) {
                option.click();
                found = true;
                log(`✓ Combobox "${label}" option "${value}" clicked (string match)`);
                break;
            }

            const optNum = parseFloat(optText);
            const valNum = parseFloat(value);
            if (!isNaN(optNum) && !isNaN(valNum) && optNum === valNum) {
                option.click();
                found = true;
                log(`✓ Combobox "${label}" option "${value}" clicked (number match)`);
                break;
            }
        }

        if (!found) {
            log(`⚠ Combobox "${label}" option "${value}" not found in dropdown`);
            button.click();
        }

        await new Promise(resolve => setTimeout(resolve, 50));
        return found;
    }

    // ============================================================
    //  ALARM SYNC - IMPORT TO ALARM
    // ============================================================
    async function importToAlarm(modal) {
        log("=== PASTE FROM STRATEGY START ===");
        const dataStr = localStorage.getItem(STORAGE_KEY);
        if (!dataStr) {
            log("⚠ ERROR: No settings found in localStorage");
            alert("Keine Strategie-Einstellungen gefunden!\nBitte zuerst im Oldman Strategietester 'Copy to Alarm' klicken.");
            return 0;
        }

        const settings = JSON.parse(dataStr);

        let imported = 0;
        let failed = [];

        const entries = Object.entries(settings);
        const checkboxEntries = [];
        const inputEntries = [];
        const comboEntries = [];

        for (const [label, value] of entries) {
            const control = findControlByLabel(modal, label);

            if (!control) {
                failed.push(label);
                log(`⚠ Control not found for "${label}"`);
                continue;
            }

            if (control.tagName === "BUTTON" && control.getAttribute('role') === 'combobox') {
                comboEntries.push([label, value, control]);
            } else if (control.type === "checkbox") {
                checkboxEntries.push([label, value, control]);
            } else {
                inputEntries.push([label, value, control]);
            }
        }

        log(`Importing: ${checkboxEntries.length} checkboxes, ${inputEntries.length} inputs, ${comboEntries.length} comboboxes`);

        for (const [label, value, control] of inputEntries) {
            log(`Processing input: ${label}`);
            const success = await setInputValue(control, value);
            if (success) imported++; else failed.push(label);
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        for (const [label, value, control] of comboEntries) {
            log(`Processing combobox: ${label}`);
            const success = await setComboboxValue(control, value);
            if (success) imported++; else failed.push(label);
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (inputEntries.length > 0 || comboEntries.length > 0) {
            log('Waiting before setting checkboxes...');
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        for (const [label, value, control] of checkboxEntries) {
            log(`Processing checkbox: ${label}`);
            const success = await setInputValue(control, value);
            if (success) imported++; else failed.push(label);
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        log(`✓ Import Complete: ${imported} successful, ${failed.length} failed`);

        if (failed.length > 0) {
        }

        if (failed.length > 0) {
            alert(`Import abgeschlossen!\n\n✓ ${imported} Settings importiert\n⚠ Fehlgeschlagen (${failed.length}):\n${failed.map(f => "  - " + f).join("\n")}`);
        } else if (imported > 0) {
            alert(`✓ Import erfolgreich!\n\n${imported} Settings wurden übertragen.`);
        }

        return imported;
    }

    // ============================================================
    //  CTRADER EXPORT - ENUM MAPPINGS
    // ============================================================
    function mapTradeDirection(str) {
        if (!str) return 2;
        const s = str.trim().toLowerCase();
        if (s.includes("long") && !s.includes("short")) return 0;
        if (s.includes("short") && !s.includes("long")) return 1;
        return 2;
    }

    function mapSlMode(str) {
        if (!str) return 0;
        const s = str.trim().toLowerCase();
        if (s === "atr-only") return 1;
        if (s.startsWith("docht vs")) return 2;
        return 0; // "Standard" und alles andere → 0
    }

    function mapStrategyFromGoldFlag(flagChecked) {
        return flagChecked ? 1 : 0;
    }

    function mapBlockFilterMode(str) {
        if (!str) return 0;
        const s = str.trim().toLowerCase();
        if (s === "ohne" || s === "none") return 0;
        if (s.startsWith("below fast") || s.startsWith("above fast")) return 1;
        if (s.startsWith("below slow") || s.startsWith("above slow")) return 2;
        if (s.startsWith("below any")  || s.startsWith("above any"))  return 3;
        if (s.startsWith("below both") || s.startsWith("above both")) return 4;
        if (s.startsWith("between"))                                   return 5;
        return 0;
    }

    // ============================================================
    //  CTRADER EXPORT - FTMO SYMBOL MAP
    // ============================================================
    const ftmoSymbolMap = {
        "AUDJPY": "AUDJPY", "AUDUSD": "AUDUSD", "GBPJPY": "GBPJPY",
        "GBPUSD": "GBPUSD", "EURGBP": "EURGBP", "EURUSD": "EURUSD",
        "NZDUSD": "NZDUSD", "USDCAD": "USDCAD", "USDCHF": "USDCHF",
        "USDJPY": "USDJPY",
        "AUS200": "AUS200.cash", "SPN35": "SPN35.cash", "US30": "US30.cash",
        "EU50": "EU50.cash", "FRA40": "FRA40.cash", "GER40": "GER40.cash",
        "DAX": "GER40.cash", "HK50": "HK50.cash", "JP225": "JP225.cash",
        "N25": "N25.cash", "NAS100": "US100.cash", "US100": "US100.cash",
        "SPX500": "US500.cash", "US500": "US500.cash", "UK100": "UK100.cash",
        "US2000": "US2000.cash",
        "BTCUSD": "BTCUSD", "DASHUSD": "DASHUSD", "ETHUSD": "ETHUSD",
        "LTCUSD": "LTCUSD", "XRPUSD": "XRPUSD", "XMRUSD": "XMRUSD",
        "NEOUSD": "NEOUSD", "ADAUSD": "ADAUSD", "DOTUSD": "DOTUSD",
        "DOGEUSD": "DOGEUSD",
        "XAGUSD": "XAGUSD", "XAUUSD": "XAUUSD", "XPDUSD": "XPDUSD",
        "XPTUSD": "XPTUSD", "UKOIL": "UKOIL.cash", "USOIL": "USOIL.cash",
        "COCOA": "COCOA.c", "COFFEE": "COFFEE.c", "SOYBEAN": "SOYBEAN.c",
        "WHEAT": "WHEAT.c"
    };

    function normalizeTvSymbol(raw) {
        if (!raw) return null;
        let s = raw.split(/[·\s/]/)[0];
        s = s.toUpperCase();
        s = s.replace(/[^A-Z0-9]/g, "");
        return s;
    }

    function mapToFtmoSymbol(tvSymbolRaw) {
        const tv = normalizeTvSymbol(tvSymbolRaw);
        if (!tv) return null;
        if (ftmoSymbolMap[tv]) return ftmoSymbolMap[tv];
        if (/^[A-Z]{6}$/.test(tv)) return tv;
        return tv + ".cash";
    }

    function getTradingViewSymbol() {
        const btn = document.querySelector('#header-toolbar-symbol-search');
        if (!btn) return null;
        const span = btn.querySelector('span');
        if (!span) return null;
        return span.innerText.trim();
    }

    function intervalTextToPeriod(text) {
        if (!text) return null;
        const t = text.trim().toUpperCase();
        if (t === "15")             return "m15";
        if (t === "30")             return "m30";
        if (t === "60" || t === "1H") return "h1";
        if (t === "D"  || t === "1D") return "d1";
        return null;
    }

    function getPeriodFromUrl() {
        // Query-Parameter
        const params = new URLSearchParams(window.location.search);
        const interval = params.get("interval");
        if (interval) return intervalTextToPeriod(interval);

        // Hash kann JSON wie {"symbol":"...","resolution":"30"} enthalten
        try {
            const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
            if (hash.startsWith("{")) {
                const obj = JSON.parse(hash);
                if (obj.resolution) return intervalTextToPeriod(String(obj.resolution));
            }
        } catch(e) {}
        return null;
    }

    function getPeriodFromToolbar() {
        // "Intervall ändern"-Button zeigt den aktuell aktiven Timeframe
        const btn = document.querySelector('button[aria-label="Intervall ändern"]');
        if (btn) {
            const result = intervalTextToPeriod(btn.innerText);
            log(`Interval button found, text: "${btn.innerText}", mapped: ${result}`);
            if (result) return result;
        }
        return null;
    }

    function getPeriodFromBacktestFlags(tv) {
        return tv["Backtest auf dem M15 ?"] ? "m15" :
               tv["Backtest auf dem M30 ?"] ? "m30" :
               "h1";
    }

    function buildChartSection(tv) {
        const tvSymbolRaw = getTradingViewSymbol();
        const fromUrl     = getPeriodFromUrl();
        const fromToolbar = getPeriodFromToolbar();
        const fromFlags   = getPeriodFromBacktestFlags(tv);
        const period = fromUrl ?? fromToolbar ?? fromFlags;
        log(`Period sources — URL: ${fromUrl}, Toolbar: ${fromToolbar}, Flags: ${fromFlags} → using: ${period}`);
        return {
            Symbol: mapToFtmoSymbol(tvSymbolRaw),
            Period: period
        };
    }

    // ============================================================
    //  CTRADER EXPORT - BASE PARAMETERS
    //  Enthält alle Felder der neuen cbotset-Struktur v3.1
    // ============================================================
    function buildBaseParameters() {
        return {
            // --- Strategie ---
            StrategyLong: 1,
            EnableRule1Long: true,
            EnableRule2Long: true,
            EnableRule3Long: true,
            EnableRule4MA200Long: true,
            EnableRule4MA50Long: true,
            Rule4MABufferLong: 0.0,
            MaxShortWickPercentLong: 15,

            StrategyShort: 1,
            EnableRule1Short: true,
            EnableRule2Short: true,
            EnableRule3Short: true,
            EnableRule4MA200Short: true,
            EnableRule4MA50Short: true,
            Rule4MABufferShort: 0.0,
            MaxShortWickPercentShort: 15,

            TradeDirection: 2,

            CRVLong: 1.0,
            CRVShort: 1.0,
            EntryOffsetLong: 0.0,
            EntryOffsetShort: 0.0,
            SLOffsetLong: 0.0,
            SLOffsetShort: 0.0,

            SLUseBodyOpenLong: false,
            SLUseBodyOpenShort: false,

            UseCandleSplitLong: false,
            Threshold1Long: 1000.0,
            Threshold2Long: 2000.0,
            Threshold3Long: 3000.0,
            FactorLowLong: 0.66,
            FactorMidLong: 0.5,
            FactorHighLong: 0.4,

            UseCandleSplitShort: false,
            Threshold1Short: 1000.0,
            Threshold2Short: 2000.0,
            Threshold3Short: 3000.0,
            FactorLowShort: 0.66,
            FactorMidShort: 0.5,
            FactorHighShort: 0.4,

            TrailingEnabledLong: false,
            Step1TriggerRLong: 1.0,
            Step1SLRLong: 0.0,
            Step2TriggerRLong: 2.0,
            Step2SLRLong: 1.0,
            Step3TriggerRLong: 3.0,
            Step3SLRLong: 2.0,
            Step4TriggerRLong: 4.0,
            Step4SLRLong: 3.0,

            TrailingEnabledShort: false,
            Step1TriggerRShort: 1.0,
            Step1SLRShort: 0.0,
            Step2TriggerRShort: 2.0,
            Step2SLRShort: 1.0,
            Step3TriggerRShort: 3.0,
            Step3SLRShort: 2.0,
            Step4TriggerRShort: 4.0,
            Step4SLRShort: 3.0,

            // --- Session ---
            SessionWindowStr: "05:00-21:00",
            FridayNoEntryAfterStr: "",
            ExcludeLongStr: "",
            ExcludeShortStr: "",
            ExcludeLongDays: "",
            ExcludeShortDays: "",
            WeekendCloseEnabled: true,
            EveningCloseEnabled: false,
            HolidayCloseEnabled: false,
            HolidayCloseRegion: 1,

            // --- Kerzenform ---
            MinCandleLong: 0.0,
            MinCandleShort: 0.0,
            MaxCandleLong: 9999.0,
            MaxCandleShort: 9999.0,
            WickPctLong: 50.0,
            WickPctShort: 50.0,
            CounterWickPctLong: 80.0,
            CounterWickPctShort: 80.0,
            BodyMinPctLong: 15.0,
            BodyMinPctShort: 15.0,
            MinEngulfingGrowthPercentLong: 0.0,
            MinEngulfingGrowthPercentShort: 0.0,

            // --- Trend/MA-Filter ---
            GlobalMAType: 0,
            UseMAFilterL: false,
            MA1LenLong: 50,
            MA2LenLong: 200,
            MA3LenLong: 0,
            UseMAFilterS: false,
            MA1LenShort: 200,
            MA2LenShort: 50,
            MA3LenShort: 0,

            BlockModeL: 0,
            BlockMAFastL: 9,
            BlockMASlowL: 21,
            BlockModeS: 0,
            BlockMAFastS: 9,
            BlockMASlowS: 21,

            // --- Indikatoren ---
            UseRSIFilterL: false,
            UseRSIFilterS: false,
            RSILenFilter: 14,
            RSILongMin: 50.0,
            RSILongMax: 100.0,
            RSIShortMin: 0.0,
            RSIShortMax: 50.0,

            UseMACDFilterL: false,
            UseMACDFilterS: false,
            MACDFast: 12,
            MACDSlow: 26,
            MACDSignal: 9,

            UseStochRSIFilterL: false,
            UseStochRSIFilterS: false,
            StochUpper: 90,
            StochLower: 10
        };
    }

    // ============================================================
    //  CTRADER EXPORT - MAIN MAPPING (TV → cTrader)
    // ============================================================
    function mapTvToConfig(tv) {
        const p = buildBaseParameters();

        // Strategy
        p.StrategyLong = mapStrategyFromGoldFlag(bool(tv["Oldman Gold Long ?"]));
        p.StrategyShort = mapStrategyFromGoldFlag(bool(tv["Oldman Gold Short ?"]));

        // Regeln
        p.EnableRule1Long = bool(tv["Regel 1L"]);
        p.EnableRule2Long = bool(tv["Regel 2L"]);
        p.EnableRule3Long = bool(tv["Regel 3L"]);
        p.EnableRule4MA200Long = bool(tv["Regel 4L (200)"]);  // ← v3.1
        p.EnableRule4MA50Long  = bool(tv["Regel 4L (50)"]);   // ← v3.1

        p.EnableRule1Short = bool(tv["Regel 1S"]);
        p.EnableRule2Short = bool(tv["Regel 2S"]);
        p.EnableRule3Short = bool(tv["Regel 3S"]);
        p.EnableRule4MA200Short = bool(tv["Regel 4S (200)"]); // ← v3.1
        p.EnableRule4MA50Short  = bool(tv["Regel 4S (50)"]);  // ← v3.1

        // MA Toleranz
        {
            const pairBuf = splitPair(tv["MA-Toleranz (Pts)"]);
            if (pairBuf.left  !== null) p.Rule4MABufferLong  = pairBuf.left;   // ← v3.1
            if (pairBuf.right !== null) p.Rule4MABufferShort = pairBuf.right;  // ← v3.1
        }

        // Hammerdocht (Pair-String "L/S")
        {
            const pairHammer = splitPair(tv["Hammerdocht (%)"]);
            if (pairHammer.left  !== null) p.MaxShortWickPercentLong  = pairHammer.left;
            if (pairHammer.right !== null) p.MaxShortWickPercentShort = pairHammer.right;
        }

        // TradeDirection
        if (tv["Trade-Richtung"]) {
            p.TradeDirection = mapTradeDirection(tv["Trade-Richtung"]);
        }

        // CRV
        p.CRVLong  = num(tv["CRV Long"],  p.CRVLong);
        p.CRVShort = num(tv["CRV Short"], p.CRVShort);

        // Entry-Offset
        {
            const pairEntry = splitPair(tv["Entry-Offset (Pts)"]);
            if (pairEntry.left  !== null) p.EntryOffsetLong  = pairEntry.left;
            if (pairEntry.right !== null) p.EntryOffsetShort = pairEntry.right;
        }

        // SL-Offset
        {
            const pairSl = splitPair(tv["SL-Offset (Pts)"]);
            if (pairSl.left  !== null) p.SLOffsetLong  = pairSl.left;
            if (pairSl.right !== null) p.SLOffsetShort = pairSl.right;
        }

        // Kerzenteilung = UseCandleSplit
        p.UseCandleSplitLong  = bool(tv["Kerzenteilung Long ?"]);
        p.UseCandleSplitShort = bool(tv["Kerzenteilung Short ?"]);

        p.SLUseBodyOpenLong  = bool(tv["SL Körper Long ?"]);
        p.SLUseBodyOpenShort = bool(tv["SL Körper Short ?"]);

        // Schwellen / Faktoren
        {
            const s1 = splitPair(tv["Schwelle 1 (Pts)"]);
            const s2 = splitPair(tv["S2"]);
            const s3 = splitPair(tv["S3"]);
            const f1 = splitPair(tv["Teilungsfaktor 1"]);
            const f2 = splitPair(tv["F2"]);
            const f3 = splitPair(tv["F3"]);

            if (s1.left  !== null) p.Threshold1Long  = s1.left;
            if (s1.right !== null) p.Threshold1Short = s1.right;
            if (s2.left  !== null) p.Threshold2Long  = s2.left;
            if (s2.right !== null) p.Threshold2Short = s2.right;
            if (s3.left  !== null) p.Threshold3Long  = s3.left;
            if (s3.right !== null) p.Threshold3Short = s3.right;
            if (f1.left  !== null) p.FactorLowLong   = f1.left;
            if (f1.right !== null) p.FactorLowShort  = f1.right;
            if (f2.left  !== null) p.FactorMidLong   = f2.left;
            if (f2.right !== null) p.FactorMidShort  = f2.right;
            if (f3.left  !== null) p.FactorHighLong  = f3.left;
            if (f3.right !== null) p.FactorHighShort = f3.right;
        }

        // Trailing
        p.TrailingEnabledLong  = bool(tv["SL Nachziehen Long ?"]);
        p.TrailingEnabledShort = bool(tv["SL Nachziehen Short ?"]);

        function mapStep(idx) {
            const trigLabel = `${idx}. Trigger (R)`;
            const stepLabel = `${idx}. Schritt (R)`;
            const trigPair = splitPair(tv[trigLabel]);
            const stepPair = splitPair(tv[stepLabel]);

            if (trigPair.left  !== null) p[`Step${idx}TriggerRLong`]  = trigPair.left;
            if (trigPair.right !== null) p[`Step${idx}TriggerRShort`] = trigPair.right;
            if (stepPair.left  !== null) p[`Step${idx}SLRLong`]       = stepPair.left;
            if (stepPair.right !== null) p[`Step${idx}SLRShort`]      = stepPair.right;
        }

        for (let i = 1; i <= 4; i++) mapStep(i);

        // Session
        if (!tv["Session-Fenster"] || tv["Session-Fenster"].trim() === "") {
            p.SessionFilterEnabled = false;
            p.SessionWindowStr = "";
        } else {
            p.SessionFilterEnabled = true;
            p.SessionWindowStr = tv["Session-Fenster"].trim();
        }
        if (tv["Ausschlusszeiten Long"]) p.ExcludeLongStr   = tv["Ausschlusszeiten Long"];
        if (tv["Zeit Short"])            p.ExcludeShortStr  = tv["Zeit Short"];
        if (tv["Ausschlusstage Long"])   p.ExcludeLongDays  = tv["Ausschlusstage Long"];
        if (tv["Tage Short"])            p.ExcludeShortDays = tv["Tage Short"];

        // Weekend Close
        p.WeekendCloseEnabled = bool(tv["Trades vor Wochenende schließen?"]);
        p.FridayNoEntryAfterStr = "";

        p.EveningCloseEnabled = bool(tv["Trades am Abend schließen?"]);

        // Holiday Close
        if (tv["Feiertag-Region"]) {
            const region = tv["Feiertag-Region"].trim().toLowerCase();
            if (region === "deaktiviert" || region.startsWith("deaktivi")) {
                p.HolidayCloseEnabled = false;
                p.HolidayCloseRegion  = 1; // Deutschland = cTrader Default
            } else if (region === "usa") {
                p.HolidayCloseEnabled = true;
                p.HolidayCloseRegion  = 0;
            } else if (region === "deutschland") {
                p.HolidayCloseEnabled = true;
                p.HolidayCloseRegion  = 1;
            }
        }
        // HolidayCloseTimeStr wird nicht exportiert - reale Schließzeit muss manuell in cTrader gesetzt werden

        // Candle Size / Wicks / Body / Engulfing
        {
            const minC     = splitPair(tv["Kerze min (Pts)"]);
            const maxC     = splitPair(tv["Kerze max (Pts)"]);
            const trendW   = splitPair(tv["Trend-Docht (%)"]);
            const counterW = splitPair(tv["Gegen-Docht (%)"]);
            const bodyMin  = splitPair(tv["Körper min (%)"]);
            const engulf   = splitPair(tv["Engulfing Growth (%)"]);

            if (minC.left     !== null) p.MinCandleLong                = minC.left;
            if (minC.right    !== null) p.MinCandleShort               = minC.right;
            if (maxC.left     !== null) p.MaxCandleLong                = maxC.left;
            if (maxC.right    !== null) p.MaxCandleShort               = maxC.right;
            if (trendW.left   !== null) p.WickPctLong                  = trendW.left;
            if (trendW.right  !== null) p.WickPctShort                 = trendW.right;
            if (counterW.left !== null) p.CounterWickPctLong           = counterW.left;
            if (counterW.right !== null) p.CounterWickPctShort         = counterW.right;
            if (bodyMin.left  !== null) p.BodyMinPctLong               = bodyMin.left;
            if (bodyMin.right !== null) p.BodyMinPctShort              = bodyMin.right;
            if (engulf.left   !== null) p.MinEngulfingGrowthPercentLong  = engulf.left;
            if (engulf.right  !== null) p.MinEngulfingGrowthPercentShort = engulf.right;
        }

        // EMA/MA-Filter
        p.GlobalMAType = tv["Gleitender Durchschnitt MA-Mode"] === "SMA" ? 1 : 0;
        p.UseMAFilterL = bool(tv["Trendfilter Long ?"]);
        p.UseMAFilterS = bool(tv["Trendfilter Short ?"]);

        p.MA1LenLong  = num(tv["MA Trend Long 1"],  p.MA1LenLong);
        p.MA2LenLong  = num(tv["MA Trend Long 2"],  p.MA2LenLong);
        p.MA3LenLong  = num(tv["MA Trend Long 3"],  p.MA3LenLong);
        p.MA1LenShort = num(tv["MA Trend Short 1"], p.MA1LenShort);
        p.MA2LenShort = num(tv["MA Trend Short 2"], p.MA2LenShort);
        p.MA3LenShort = num(tv["MA Trend Short 3"], p.MA3LenShort);

        // Blockfilter
        p.BlockModeL   = mapBlockFilterMode(tv["Blockfilter Long Mode"]);
        p.BlockMAFastL = num(tv["MA Block Fast Long"],  p.BlockMAFastL);
        p.BlockMASlowL = num(tv["MA Block Slow Long"],  p.BlockMASlowL);

        p.BlockModeS   = mapBlockFilterMode(tv["Blockfilter Short Mode"]);
        p.BlockMAFastS = num(tv["MA Block Fast Short"], p.BlockMAFastS);
        p.BlockMASlowS = num(tv["MA Block Slow Short"], p.BlockMASlowS);

        // RSI
        p.UseRSIFilterL = bool(tv["RSI-Filter Long ?"]);
        p.UseRSIFilterS = bool(tv["RSI-Filter Short ?"]);
        p.RSILenFilter  = num(tv["RSI-Länge"], p.RSILenFilter);

        p.RSILongMin  = num(tv["RSI Long: min"],  p.RSILongMin);
        p.RSILongMax  = num(tv["RSI Long: max"],  p.RSILongMax);
        p.RSIShortMin = num(tv["RSI Short: min"], p.RSIShortMin);
        p.RSIShortMax = num(tv["RSI Short: max"], p.RSIShortMax);

        // MACD
        p.UseMACDFilterL = bool(tv["MACD-Filter Long ?"]);
        p.UseMACDFilterS = bool(tv["MACD-Filter Short ?"]);

        p.MACDFast   = num(tv["MACD-Fast"],   p.MACDFast);
        p.MACDSlow   = num(tv["MACD-Slow"],   p.MACDSlow);
        p.MACDSignal = num(tv["MACD-Signal"], p.MACDSignal);

        // StochRSI
        p.UseStochRSIFilterL = bool(tv["StochRSI-Filter Long ?"]);
        p.UseStochRSIFilterS = bool(tv["StochRSI-Filter Short ?"]);

        p.StochUpper = num(tv["SRSI Max (Long)"],  p.StochUpper);
        p.StochLower = num(tv["SRSI Min (Short)"], p.StochLower);

        return p;
    }

    // ============================================================
    //  CTRADER EXPORT - MAIN FUNCTION
    //  Beim Export werden Bot-Einstellungen aus einer gespeicherten
    //  Basis-cbotset geladen (falls vorhanden), damit LicenseKey etc.
    //  nicht verloren gehen.
    // ============================================================
    function exportCTraderConfig(modal) {
        log("=== CTRADER EXPORT START ===");
        const tv = extractSettings(modal);
        log(`Extracted ${Object.keys(tv).length} settings from strategy modal`);

        const parameters = mapTvToConfig(tv);
        log("Mapped TV settings to cTrader parameters");

        const chart = buildChartSection(tv);
        log(`Chart section: Symbol=${chart.Symbol}, Period=${chart.Period}`);

        const cbotset = {
            Chart: chart,
            Parameters: parameters
        };

        const jsonStr = JSON.stringify(cbotset, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;

        const sym = cbotset.Chart.Symbol || "unknown";
        const per = cbotset.Chart.Period || "h1";
        const filename = `${sym}_${per}.cbotset`;
        a.download = filename;

        log(`Downloading: ${filename}`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        log("=== CTRADER EXPORT COMPLETE ===");
        alert(`✓ cTrader Export erfolgreich!\n\nDatei: ${filename}\n\n⚠ Bitte manuell in cTrader setzen:\n- WE-Endzeit (WeekendCloseTimeStr)\n- Abend-Endzeit (EveningCloseTimeStr)\n- Feiertag-Schließzeit (HolidayCloseTimeStr)\n→ Format HH:MM:SS, reale Schließzeit (nicht Kerzenzeit!)`);
    }

    // ============================================================
    //  CTRADER IMPORT - REVERSE MAPPINGS
    // ============================================================
    function reverseTradeDirection(val) {
        if (val === 0) return "Long";
        if (val === 1) return "Short";
        return "Beide";
    }

    function reverseSlMode(val) {
        if (val === 1) return "ATR-only";
        if (val === 2) return "Docht vs ATR (Min)";
        return "Standard";
    }

    function reverseStrategyMode(val) {
        return val === 1 ? true : false;
    }

    function reverseBlockFilterModeLong(val) {
        const modes = ["Ohne", "Below Fast", "Below Slow", "Below Any", "Below Both", "Between Fast&Slow"];
        return modes[val] ?? "Ohne";
    }

    function reverseBlockFilterModeShort(val) {
        const modes = ["Ohne", "Above Fast", "Above Slow", "Above Any", "Above Both", "Between Fast&Slow"];
        return modes[val] ?? "Ohne";
    }

    function makePair(left, right) {
        if (left === right) return String(left);
        return `${left}/${right}`;
    }

    // ============================================================
    //  CTRADER IMPORT - CONFIG TO TV MAPPING
    // ============================================================
    function mapConfigToTv(config) {
        const tv = {};

        // Strategy
        tv["Oldman Gold Long ?"]  = reverseStrategyMode(config.StrategyLong);
        tv["Oldman Gold Short ?"] = reverseStrategyMode(config.StrategyShort);

        // Regeln
        tv["Regel 1L"]     = config.EnableRule1Long;
        tv["Regel 2L"]     = config.EnableRule2Long;
        tv["Regel 3L"]     = config.EnableRule3Long;
        tv["Regel 4L (200)"] = config.EnableRule4MA200Long;   // ← v3.1
        tv["Regel 4L (50)"]  = config.EnableRule4MA50Long;    // ← v3.1

        tv["Regel 1S"]     = config.EnableRule1Short;
        tv["Regel 2S"]     = config.EnableRule2Short;
        tv["Regel 3S"]     = config.EnableRule3Short;
        tv["Regel 4S (200)"] = config.EnableRule4MA200Short;  // ← v3.1
        tv["Regel 4S (50)"]  = config.EnableRule4MA50Short;   // ← v3.1

        // MA Toleranz
        tv["MA-Toleranz (Pts)"] = makePair(config.Rule4MABufferLong, config.Rule4MABufferShort); // ← v3.1

        // Hammerdocht (Pair-String "L/S")
        tv["Hammerdocht (%)"] = makePair(config.MaxShortWickPercentLong, config.MaxShortWickPercentShort);

        // Trade-Richtung
        tv["Trade-Richtung"] = reverseTradeDirection(config.TradeDirection);

        // CRV
        tv["CRV Long"]  = config.CRVLong;
        tv["CRV Short"] = config.CRVShort;

        // Entry/SL Offset
        tv["Entry-Offset (Pts)"] = makePair(config.EntryOffsetLong, config.EntryOffsetShort);
        tv["SL-Offset (Pts)"]    = makePair(config.SLOffsetLong,    config.SLOffsetShort);

        // Kerzenteilung = UseCandleSplit
        tv["Kerzenteilung Long ?"]  = config.UseCandleSplitLong;
        tv["Kerzenteilung Short ?"] = config.UseCandleSplitShort;

        tv["SL Körper Long ?"]  = config.SLUseBodyOpenLong;
        tv["SL Körper Short ?"] = config.SLUseBodyOpenShort;

        // Schwellen / Faktoren
        tv["Schwelle 1 (Pts)"] = makePair(config.Threshold1Long, config.Threshold1Short);
        tv["S2"]               = makePair(config.Threshold2Long, config.Threshold2Short);
        tv["S3"]               = makePair(config.Threshold3Long, config.Threshold3Short);
        tv["Teilungsfaktor 1"] = makePair(config.FactorLowLong,  config.FactorLowShort);
        tv["F2"]               = makePair(config.FactorMidLong,  config.FactorMidShort);
        tv["F3"]               = makePair(config.FactorHighLong, config.FactorHighShort);

        // Trailing
        tv["SL Nachziehen Long ?"]  = config.TrailingEnabledLong;
        tv["SL Nachziehen Short ?"] = config.TrailingEnabledShort;

        for (let i = 1; i <= 4; i++) {
            tv[`${i}. Trigger (R)`] = makePair(config[`Step${i}TriggerRLong`],  config[`Step${i}TriggerRShort`]);
            tv[`${i}. Schritt (R)`] = makePair(config[`Step${i}SLRLong`],       config[`Step${i}SLRShort`]);
        }

        // Session
        tv["Session-Fenster"]      = config.SessionWindowStr  || "";
        tv["Ausschlusszeiten Long"] = config.ExcludeLongStr   || "";
        tv["Zeit Short"]            = config.ExcludeShortStr  || "";
        tv["Ausschlusstage Long"]   = config.ExcludeLongDays  || "";
        tv["Tage Short"]            = config.ExcludeShortDays || "";

        // Weekend Close
        tv["Trades vor Wochenende schließen?"] = config.WeekendCloseEnabled;

        tv["Trades am Abend schließen?"] = config.EveningCloseEnabled;

        // Holiday Close
        if (!config.HolidayCloseEnabled) {
            tv["Feiertag-Region"] = "Deaktiviert";
        } else if (config.HolidayCloseRegion === 0) {
            tv["Feiertag-Region"] = "USA";
        } else {
            tv["Feiertag-Region"] = "Deutschland";
        }
        // Early-Close Zeit wird nicht importiert - reale Schließzeit muss manuell in TV gesetzt werden

        // Candle Size / Wicks / Body / Engulfing
        tv["Kerze min (Pts)"]    = makePair(config.MinCandleLong,   config.MinCandleShort);
        tv["Kerze max (Pts)"]    = makePair(config.MaxCandleLong,   config.MaxCandleShort);
        tv["Trend-Docht (%)"]   = makePair(config.WickPctLong,     config.WickPctShort);
        tv["Gegen-Docht (%)"]   = makePair(config.CounterWickPctLong, config.CounterWickPctShort);
        tv["Körper min (%)"]     = makePair(config.BodyMinPctLong,  config.BodyMinPctShort);
        tv["Engulfing Growth (%)"] = makePair(config.MinEngulfingGrowthPercentLong, config.MinEngulfingGrowthPercentShort);

        // EMA/MA-Filter
        tv["Gleitender Durchschnitt MA-Mode"] = config.GlobalMAType === 1 ? "SMA" : "EMA";
        tv["Trendfilter Long ?"]  = config.UseMAFilterL;
        tv["Trendfilter Short ?"] = config.UseMAFilterS;

        tv["MA Trend Long 1"]  = String(config.MA1LenLong);
        tv["MA Trend Long 2"]  = String(config.MA2LenLong);
        tv["MA Trend Long 3"]  = String(config.MA3LenLong);
        tv["MA Trend Short 1"] = String(config.MA1LenShort);
        tv["MA Trend Short 2"] = String(config.MA2LenShort);
        tv["MA Trend Short 3"] = String(config.MA3LenShort);

        // Blockfilter
        tv["Blockfilter Long Mode"]   = reverseBlockFilterModeLong(config.BlockModeL);
        tv["MA Block Fast Long"]      = String(config.BlockMAFastL);
        tv["MA Block Slow Long"]      = String(config.BlockMASlowL);

        tv["Blockfilter Short Mode"]  = reverseBlockFilterModeShort(config.BlockModeS);
        tv["MA Block Fast Short"]     = String(config.BlockMAFastS);
        tv["MA Block Slow Short"]     = String(config.BlockMASlowS);

        // RSI
        tv["RSI-Filter Long ?"]  = config.UseRSIFilterL;
        tv["RSI-Filter Short ?"] = config.UseRSIFilterS;
        tv["RSI-Länge"]           = config.RSILenFilter;

        tv["RSI Long: min"]  = config.RSILongMin;
        tv["RSI Long: max"]  = config.RSILongMax;
        tv["RSI Short: min"] = config.RSIShortMin;
        tv["RSI Short: max"] = config.RSIShortMax;

        // MACD
        tv["MACD-Filter Long ?"]  = config.UseMACDFilterL;
        tv["MACD-Filter Short ?"] = config.UseMACDFilterS;

        tv["MACD-Fast"]   = config.MACDFast;
        tv["MACD-Slow"]   = config.MACDSlow;
        tv["MACD-Signal"] = config.MACDSignal;

        // StochRSI
        tv["StochRSI-Filter Long ?"]  = config.UseStochRSIFilterL;
        tv["StochRSI-Filter Short ?"] = config.UseStochRSIFilterS;

        tv["SRSI Max (Long)"]  = config.StochUpper;
        tv["SRSI Min (Short)"] = config.StochLower;

        return tv;
    }

    // ============================================================
    //  CTRADER IMPORT - MAIN FUNCTION
    // ============================================================
    async function importCTraderConfig(modal) {
        log("=== CTRADER IMPORT START ===");
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.cbotset';

            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) {
                    log("No file selected");
                    resolve(0);
                    return;
                }

                try {
                    log(`Reading file: ${file.name}`);
                    const text = await file.text();
                    const cbotset = JSON.parse(text);
                    log(`Parsed JSON successfully, size: ${text.length} bytes`);

                    if (!cbotset.Parameters) {
                        log("⚠ ERROR: No Parameters object found in .cbotset file");
                        alert("⚠ Ungültige .cbotset Datei!\n\nKein Parameters-Objekt gefunden.");
                        resolve(0);
                        return;
                    }

                    // Konvertiere Config zu TV-Settings
                    const tvSettings = mapConfigToTv(cbotset.Parameters);

                    let imported = 0;
                    let failed = [];

                    const checkboxEntries = [];
                    const inputEntries = [];
                    const comboEntries = [];

                    log("Searching for controls in modal...");
                    for (const [label, value] of Object.entries(tvSettings)) {
                        const control = findControlByLabel(modal, label);

                        if (!control) {
                            failed.push(label);
                            log(`⚠ Control not found for "${label}" with value "${value}"`);
                            continue;
                        }

                        if (control.tagName === "BUTTON" && control.getAttribute('role') === 'combobox') {
                            comboEntries.push([label, value, control]);
                        } else if (control.type === "checkbox") {
                            checkboxEntries.push([label, value, control]);
                        } else {
                            inputEntries.push([label, value, control]);
                        }
                    }

                    log(`Importing: ${checkboxEntries.length} checkboxes, ${inputEntries.length} inputs, ${comboEntries.length} comboboxes`);

                    // Loading-Overlay
                    const overlay = document.createElement("div");
                    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;justify-content:center;align-items:center;z-index:99999;";

                    const popup = document.createElement("div");
                    popup.style.cssText = "background:#2E3A47;padding:30px 40px;border-radius:8px;color:white;font-size:16px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.5);";
                    popup.innerHTML = `<div style="font-size:24px;margin-bottom:15px;">📥</div><div style="font-weight:bold;margin-bottom:10px;">cTrader Import läuft...</div><div style="font-size:14px;opacity:0.8;">Einstellungen werden übertragen</div>`;

                    overlay.appendChild(popup);
                    document.body.appendChild(overlay);

                    for (const [label, value, control] of inputEntries) {
                        log(`Processing input: ${label}`);
                        const success = await setInputValue(control, value);
                        if (success) imported++; else failed.push(label);
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }

                    for (const [label, value, control] of comboEntries) {
                        log(`Processing combobox: ${label}`);
                        const success = await setComboboxValue(control, value);
                        if (success) imported++; else failed.push(label);
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }

                    if (inputEntries.length > 0 || comboEntries.length > 0) {
                        log('Waiting before setting checkboxes...');
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }

                    for (const [label, value, control] of checkboxEntries) {
                        log(`Processing checkbox: ${label}`);
                        const success = await setInputValue(control, value);
                        if (success) imported++; else failed.push(label);
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }

                    document.body.removeChild(overlay);

                    log(`✓ cTrader Import Complete: ${imported} successful, ${failed.length} failed`);

                    if (failed.length > 0) {
                    }

                    if (failed.length > 0) {
                        alert(`cTrader Import abgeschlossen!\n\n✓ ${imported} Settings importiert\n⚠ Fehlgeschlagen (${failed.length}):\n${failed.map(f => "  - " + f).join("\n")}\n\n⚠ Bitte manuell in TradingView setzen:\n- WE-Endzeit\n- Abend-Endzeit\n- Early-Close Zeit\n→ Kerzenzeit des jeweiligen Timeframes!`);
                    } else {
                        alert(`✓ cTrader Import erfolgreich!\n\n${imported} Settings wurden übertragen.\n\n⚠ Bitte manuell in TradingView setzen:\n- WE-Endzeit\n- Abend-Endzeit\n- Early-Close Zeit\n→ Kerzenzeit des jeweiligen Timeframes!`);
                    }

                    resolve(imported);

                } catch (err) {
                    console.error("=== CTRADER IMPORT ERROR ===");
                    console.error(err);
                    log("⚠ cTrader Import failed with error:", err.message);
                    alert(`⚠ Fehler beim Importieren!\n\n${err.message}`);
                    resolve(0);
                }
            };

            input.click();
        });
    }

    // ============================================================
    //  BUTTON INJECTION - STRATEGY (vier Buttons)
    // ============================================================
    function addButtonsToStrategy(modal) {
        const footer = Array.from(modal.querySelectorAll("div"))
            .find(div =>
                div.querySelector("button[name='cancel']") &&
                div.querySelector("button[name='submit']")
            );

        if (!footer) return;
        const actions = footer.querySelector("#property-actions");
        if (!actions) return;
        if (footer.querySelector(".oldman-buttons-container")) return;

        const container = document.createElement("div");
        container.className = "oldman-buttons-container";
        container.style.cssText = "display:inline-flex;gap:10px;margin-left:10px;";

        function makeBtn(text, border, bg) {
            const btn = document.createElement("button");
            btn.textContent = text;
            btn.style.cssText = `padding:2px 8px;cursor:pointer;border-radius:4px;color:white;`;
            btn.style.setProperty('white-space', 'nowrap', 'important');
            btn.style.setProperty('font-family', 'inherit', 'important');
            btn.style.setProperty('font-size', 'inherit', 'important');
            btn.style.setProperty('font-weight', 'inherit', 'important');
            btn.style.setProperty('background', bg, 'important');
            btn.style.setProperty('border', `1px solid ${border}`, 'important');
            btn.style.setProperty('width', 'auto', 'important');
            btn.style.setProperty('min-width', 'unset', 'important');
            return btn;
        }

        const copyBtn   = makeBtn("Alarm",    "#4CAF50", "#2E7D32");
        const exportBtn = makeBtn("cT Export",   "#2196F3", "#1976D2");
        const importBtn = makeBtn("cT Import",   "#FF9800", "#F57C00");
        copyBtn.addEventListener("click", () => {
            const count = exportStrategySettings(modal);
            alert(`✓ Einstellungen kopiert!\n\nBitte öffne jetzt den "Oldman Alarm TiL" Indikator\nund klicke auf "Strategie einfügen".`);
            setTimeout(() => { copyBtn.textContent = "Alarm"; copyBtn.style.background = "#2E7D32"; }, 2000);
        });

        exportBtn.addEventListener("click", () => { exportCTraderConfig(modal); });

        importBtn.addEventListener("click", async () => { await importCTraderConfig(modal); });

        container.appendChild(copyBtn);
        container.appendChild(exportBtn);
        container.appendChild(importBtn);
        actions.insertAdjacentElement("afterend", container);
    }

    // ============================================================
    //  BUTTON INJECTION - ALARM (zwei Buttons)
    // ============================================================
    function addImportButtonToAlarm(modal) {
        const footer = Array.from(modal.querySelectorAll("div"))
            .find(div =>
                div.querySelector("button[name='cancel']") &&
                div.querySelector("button[name='submit']")
            );

        if (!footer) return;
        const actions = footer.querySelector("#property-actions");
        if (!actions) return;
        if (footer.querySelector(".oldman-paste-from-strategy-btn")) return;

        const container = document.createElement("div");
        container.className = "oldman-alarm-buttons-container";
        container.style.cssText = "display:inline-flex;gap:10px;margin-left:10px;";

        const btn = document.createElement("button");
        btn.textContent = "Strategie einfügen";
        btn.className = "oldman-paste-from-strategy-btn";
        btn.style.cssText = "padding:2px 8px;cursor:pointer;border-radius:4px;color:white;";
        btn.style.setProperty('white-space', 'nowrap', 'important');
        btn.style.setProperty('font-family', 'inherit', 'important');
        btn.style.setProperty('font-size', 'inherit', 'important');
        btn.style.setProperty('font-weight', 'inherit', 'important');
        btn.style.setProperty('background', '#2E7D32', 'important');
        btn.style.setProperty('border', '1px solid #4CAF50', 'important');
        btn.style.setProperty('width', 'auto', 'important');
        btn.style.setProperty('min-width', 'unset', 'important');

        btn.addEventListener("click", async () => {
            btn.disabled = true;
            btn.textContent = "Wird importiert...";

            const overlay = document.createElement("div");
            overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;justify-content:center;align-items:center;z-index:99999;";

            const popup = document.createElement("div");
            popup.style.cssText = "background:#2E3A47;padding:30px 40px;border-radius:8px;color:white;font-size:16px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.5);";
            popup.innerHTML = `<div style="font-size:24px;margin-bottom:15px;">⚙️</div><div style="font-weight:bold;margin-bottom:10px;">Import läuft...</div><div style="font-size:14px;opacity:0.8;">Einstellungen werden übertragen</div>`;

            overlay.appendChild(popup);
            document.body.appendChild(overlay);

            const count = await importToAlarm(modal);

            document.body.removeChild(overlay);

            btn.textContent = "Strategie einfügen";
            btn.style.background = "#2E7D32";
            btn.disabled = false;
        });

        container.appendChild(btn);
        actions.insertAdjacentElement("afterend", container);
    }

    // ============================================================
    //  OBSERVER
    // ============================================================
    const observer = new MutationObserver(() => {
        const strategyModal = document.querySelector('div[data-dialog-name="Oldman Strategie TiL"]');
        if (strategyModal) addButtonsToStrategy(strategyModal);
        const alarmModal = document.querySelector('div[data-dialog-name="Oldman Alarm TiL"]');
        if (alarmModal) addImportButtonToAlarm(alarmModal);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    log('Oldman Universal Script v1.5 ready');

})();