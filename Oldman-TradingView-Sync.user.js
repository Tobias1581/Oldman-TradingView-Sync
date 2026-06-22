// ==UserScript==
// @name         Oldman TradingView Sync & Export
// @version      4.08
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
    function logTable(title, rows) {
        if (!DEBUG || !rows.length) return;
        console.group(`[Oldman Universal] ${title}`);
        console.table(rows);
        console.groupEnd();
    }

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

        const tvVer = detectTvVersion(settings);
        log(`Detected TiL version: ${tvVer}`);

        // Gemeinsame Felder – identisch in v3.1 und v4.0
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
            "Zeitzone (UTC)",
            "Session-Fenster",
            "Ausschlusszeiten Long", "Zeit Short",
            "Ausschlusstage Long", "Tage Short",

            // 04 - Kerzenform
            "Kerze min (Pts)", "Kerze max (Pts)",
            "Trend-Docht (%)", "Gegen-Docht (%)",
            "Körper min (%)", "Engulfing Growth (%)",

            // 05 - MA-Mode (gleiche Bezeichnung in v3.1 und v4.0)
            "Gleitender Durchschnitt MA-Mode",

            // 06 - Blockfilter-Mode (Label identisch in v3.1 und v4.0)
            "Blockfilter Long Mode",
            "Blockfilter Short Mode",

            // 07 - Indikatoren (Bezeichnungen identisch)
            "RSI-Filter Long ?", "RSI-Filter Short ?", "RSI-Länge",
            "RSI Long: min", "RSI Long: max",
            "RSI Short: min", "RSI Short: max",
            "MACD-Filter Long ?", "MACD-Filter Short ?",
            "MACD-Fast", "MACD-Slow", "MACD-Signal",
            "StochRSI-Filter Long ?", "StochRSI-Filter Short ?",
            "SRSI Max (Long)", "SRSI Min (Short)",
        ];

        // Versionsspezifische Felder anhängen
        if (tvVer === '3.1') {
            fieldsToExport.push(
                // Basis v3.1
                "Forex-Währungspaar ?",
                "Volumen Modus ?",
                "Schwellen in % ?", "Schwelle 1 (%)", "S2%", "S3%",
                // Trendfilter v3.1 (kein ?)
                "Trendfilter Long", "Trendfilter Short",
                "MA1", "MA2",           // MA Trend Long
                "MA3", "MA4",           // MA Trend Short
                // Blockfilter-MAs v3.1
                "MA Fast Long", "MA Slow Long",
                "MA Fast Short", "MA Slow Short",
                // Sortierfilter v3.1
                "Sortierfilter: Long 20 > 50 > 200", "Short 200 > 50 > 20",
                "Sortierfilter: Long 10 > 20 > 50",  "Short 50 > 20 > 10",
                // SL-Modus und ATR-SL v3.1
                "SL Modus", "ATR-Periode", "ATR-Multiplikator",
                // SL Nachziehen Trailing (v3.1 mit Pair-Strings)
                "SL Nachziehen Long ?", "SL Nachziehen Short ?",
                "1. Trigger (R)", "1. Schritt (R)",
                "2. Trigger (R)", "2. Schritt (R)",
                "3. Trigger (R)", "3. Schritt (R)",
                "4. Trigger (R)", "4. Schritt (R)",
                "5. Trigger (R)", "5. Schritt (R)",
                "6. Trigger (R)", "6. Schritt (R)"
            );
        } else {
            fieldsToExport.push(
                // Trendfilter v4.0 (mit ?)
                "Trendfilter Long ?", "Trendfilter Short ?",
                "MA Trend Long 1", "MA Trend Long 2", "MA Trend Long 3",
                "MA Trend Short 1", "MA Trend Short 2", "MA Trend Short 3",
                // Blockfilter-MAs v4.0
                "MA Block Fast Long", "MA Block Slow Long",
                "MA Block Fast Short", "MA Block Slow Short",
                // ADX/ATR-Filter v4.0 (silent, weil im UI ausgeblendet)
                "ADX-Filter Long ?", "ADX-Filter Short ?", "ADX Periode", "ADX Minimum",
                "ATR-Filter Long ?", "ATR-Filter Short ?", "ATR Periode", "ATR Min (Pts)", "ATR Max (Pts)"
            );
        }

        fieldsToExport.forEach(field => {
            if (settings[field] !== undefined) {
                alarmSettings[field] = settings[field];
            } else {
                log(`⚠ Field "${field}" not found in strategy settings`);
            }
        });

        // Felder die im Modal existieren, aber nicht exportiert werden
        const notExported = Object.keys(settings).filter(k => !fieldsToExport.includes(k));
        if (notExported.length > 0) log(`ℹ Nicht exportierte Modal-Felder (${notExported.length}): ${notExported.join(' | ')}`);

        alarmSettings['_tilVersion'] = tvVer;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(alarmSettings));
        log(`Saved ${Object.keys(alarmSettings).length} settings to localStorage (TiL v${tvVer})`);

        // Felder die still übersprungen werden (im UI ausgeblendet oder nur für cTrader-Export)
        const silentFields = [
            "Gleitender Durchschnitt MA-Mode",
            "ADX-Filter Long ?", "ADX-Filter Short ?", "ADX Periode", "ADX Minimum",
            "ATR-Filter Long ?", "ATR-Filter Short ?", "ATR Periode", "ATR Min (Pts)", "ATR Max (Pts)"
        ];

        const missing = fieldsToExport.filter(f => settings[f] === undefined);
        const missingVisible = missing.filter(f => !silentFields.includes(f));
        log(`Export Summary: ${Object.keys(alarmSettings).length} exported, ${missing.length} missing (${missing.length - missingVisible.length} silent)`);

        logTable(`Strategie→Alarm (TiL v${tvVer}) — Feldübersicht`, fieldsToExport.map(f => ({
            Feld: f,
            Status: settings[f] !== undefined ? '✓ KOPIERT' : silentFields.includes(f) ? '– SILENT' : '✗ FEHLT',
            Wert: settings[f] !== undefined ? String(settings[f]).substring(0, 50) : ''
        })));

        log("=== COPY TO ALARM COMPLETE ===");

        if (missingVisible.length > 0) {
            alert(`Export abgeschlossen!\n\n✓ ${Object.keys(alarmSettings).length} Settings exportiert\n⚠ Nicht gefunden (${missingVisible.length}):\n${missingVisible.map(f => "  - " + f).join("\n")}`);
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

        // Versions-Check: gespeicherte TiL-Version vs. aktueller Alarm-Dialog
        const savedVer = settings['_tilVersion'];
        if (savedVer) {
            const currentTv = extractSettings(modal);
            const targetVer = detectTvVersion(currentTv);
            log(`Version check: saved=${savedVer}, target=${targetVer}`);
            if (savedVer !== targetVer) {
                alert(`⚠ Versions-Konflikt!\n\nDie kopierten Einstellungen stammen von Strategietester v${savedVer}, du verwendest aber Alarm v${targetVer}.\n\nErlaubte Kombinationen:\n• Strategietester v3.1 → Alarm v3.1\n• Strategietester v4.0 → Alarm v4.0`);
                return 0;
            }
        }

        let imported = 0;
        let failed = [];
        const written = [];

        const entries = Object.entries(settings).filter(([k]) => k !== '_tilVersion');
        const checkboxEntries = [];
        const inputEntries = [];
        const comboEntries = [];

        for (const [label, value] of entries) {
            const control = findControlByLabel(modal, label);

            if (!control) {
                failed.push({ Feld: label, Status: '✗ NICHT GEFUNDEN', Wert: String(value).substring(0, 50) });
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
            if (success) { imported++; written.push({ Feld: label, Status: '✓ GESCHRIEBEN', Wert: String(value).substring(0, 50) }); }
            else { failed.push({ Feld: label, Status: '✗ FEHLER', Wert: String(value).substring(0, 50) }); }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        for (const [label, value, control] of comboEntries) {
            log(`Processing combobox: ${label}`);
            const success = await setComboboxValue(control, value);
            if (success) { imported++; written.push({ Feld: label, Status: '✓ GESCHRIEBEN', Wert: String(value).substring(0, 50) }); }
            else { failed.push({ Feld: label, Status: '✗ FEHLER', Wert: String(value).substring(0, 50) }); }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (inputEntries.length > 0 || comboEntries.length > 0) {
            log('Waiting before setting checkboxes...');
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        for (const [label, value, control] of checkboxEntries) {
            log(`Processing checkbox: ${label}`);
            const success = await setInputValue(control, value);
            if (success) { imported++; written.push({ Feld: label, Status: '✓ GESCHRIEBEN', Wert: String(value).substring(0, 50) }); }
            else { failed.push({ Feld: label, Status: '✗ FEHLER', Wert: String(value).substring(0, 50) }); }
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        log(`✓ Import Complete: ${imported} successful, ${failed.length} failed`);
        logTable(`Alarm Import (TiL v${savedVer}) — Feldübersicht`, [...written, ...failed]);

        if (imported > 0) {
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
    //  VERSION DETECTION
    // ============================================================
    function detectVersion(config) {
        if (config._cbotVersion) return config._cbotVersion;
        // Fallback für ältere Exports ohne Marker:
        // UseMASort2050200L existiert nur in v3.14-Exports (v3.1-spezifisches Feld)
        if (config.UseMASort2050200L !== undefined) return '3.14';
        if (config.MA1LenLong !== undefined) return '4.0';
        if (config.MA1Len     !== undefined) return '3.14';
        return '4.0';
    }

    // Erkennt die TiL-Version anhand der im Dialog vorhandenen Felder
    // v3.1: hat "Backtest auf dem M15 ?" — v4.0 hat das nicht mehr
    function detectTvVersion(tv) {
        if (tv["Backtest auf dem M15 ?"] !== undefined) return '3.1'; // Strategietester-Marker
        if (tv["Trendfilter Long"] !== undefined) return '3.1';       // Alarm-Marker (v3.1 ohne ?)
        if (tv["MA1"] !== undefined) return '3.1';                    // Fallback-Marker v3.1
        return '4.0';
    }

    // ============================================================
    //  CTRADER EXPORT - BASE PARAMETERS
    //  Enthält alle Felder für v3.14 und v4.0
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
            // v3.14 compat: Stufen 5 & 6
            Step5TriggerRLong: 5.0,
            Step5SLRLong: 4.0,
            Step6TriggerRLong: 6.0,
            Step6SLRLong: 5.0,

            TrailingEnabledShort: false,
            Step1TriggerRShort: 1.0,
            Step1SLRShort: 0.0,
            Step2TriggerRShort: 2.0,
            Step2SLRShort: 1.0,
            Step3TriggerRShort: 3.0,
            Step3SLRShort: 2.0,
            Step4TriggerRShort: 4.0,
            Step4SLRShort: 3.0,
            // v3.14 compat: Stufen 5 & 6
            Step5TriggerRShort: 5.0,
            Step5SLRShort: 4.0,
            Step6TriggerRShort: 6.0,
            Step6SLRShort: 5.0,

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
            // v3.14 compat: alte MA-Property-Namen
            MA1Len: 50,
            MA2Len: 200,
            MA3Len: 200,
            MA4Len: 50,
            UseMASort2050200L: false,
            UseMASort2050200S: false,
            UseMASort102050L: false,
            UseMASort102050S: false,
            // v3.14 compat: SL-Modus und SL-ATR
            SLMode: 0,
            AtrPeriod: 14,
            AtrMultiplier: 1.0,
            SLHighLowMode: 1,

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
            StochLower: 10,

            UseADXFilterL: false,
            UseADXFilterS: false,
            ADXPeriod: 14,
            ADXMin: 20.0,

            UseATRFilterL: false,
            UseATRFilterS: false,
            ATRPeriod: 14,
            ATRMinPips: 0.0,
            ATRMaxPips: 0.0
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

        const tvVer = detectTvVersion(tv);
        log(`Detected TiL version in mapTvToConfig: ${tvVer}`);
        p._cbotVersion = tvVer === '3.1' ? '3.14' : '4.0';

        const maxStep = tvVer === '3.1' ? 6 : 4;
        for (let i = 1; i <= maxStep; i++) mapStep(i);

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

        // EMA/MA-Filter (Feldbezeichnungen unterscheiden sich zwischen TiL v3.1 und v4.0)
        p.GlobalMAType = tv["Gleitender Durchschnitt MA-Mode"] === "SMA" ? 1 : 0;

        if (tvVer === '3.1') {
            p.UseMAFilterL = bool(tv["Trendfilter Long"]);
            p.UseMAFilterS = bool(tv["Trendfilter Short"]);

            p.MA1LenLong  = num(tv["MA1"], p.MA1LenLong);
            p.MA2LenLong  = num(tv["MA2"], p.MA2LenLong);
            p.MA3LenLong  = 0;
            p.MA1LenShort = num(tv["MA3"], p.MA1LenShort);
            p.MA2LenShort = num(tv["MA4"], p.MA2LenShort);
            p.MA3LenShort = 0;

            // Sortierfilter v3.1 → cBot v3.14 Properties
            p.UseMASort2050200L = bool(tv["Sortierfilter: Long 20 > 50 > 200"]);
            p.UseMASort2050200S = bool(tv["Short 200 > 50 > 20"]);
            p.UseMASort102050L  = bool(tv["Sortierfilter: Long 10 > 20 > 50"]);
            p.UseMASort102050S  = bool(tv["Short 50 > 20 > 10"]);

            // SL-Modus und ATR-SL v3.1 → cBot v3.14 Properties
            p.SLMode        = mapSlMode(tv["SL Modus"]);
            p.AtrPeriod     = num(tv["ATR-Periode"],      p.AtrPeriod);
            p.AtrMultiplier = num(tv["ATR-Multiplikator"], p.AtrMultiplier);

            // Blockfilter-MAs v3.1
            p.BlockMAFastL = num(tv["MA Fast Long"],  p.BlockMAFastL);
            p.BlockMASlowL = num(tv["MA Slow Long"],  p.BlockMASlowL);
            p.BlockMAFastS = num(tv["MA Fast Short"], p.BlockMAFastS);
            p.BlockMASlowS = num(tv["MA Slow Short"], p.BlockMASlowS);
        } else {
            p.UseMAFilterL = bool(tv["Trendfilter Long ?"]);
            p.UseMAFilterS = bool(tv["Trendfilter Short ?"]);

            p.MA1LenLong  = num(tv["MA Trend Long 1"],  p.MA1LenLong);
            p.MA2LenLong  = num(tv["MA Trend Long 2"],  p.MA2LenLong);
            p.MA3LenLong  = num(tv["MA Trend Long 3"],  p.MA3LenLong);
            p.MA1LenShort = num(tv["MA Trend Short 1"], p.MA1LenShort);
            p.MA2LenShort = num(tv["MA Trend Short 2"], p.MA2LenShort);
            p.MA3LenShort = num(tv["MA Trend Short 3"], p.MA3LenShort);

            // Blockfilter-MAs v4.0
            p.BlockMAFastL = num(tv["MA Block Fast Long"],  p.BlockMAFastL);
            p.BlockMASlowL = num(tv["MA Block Slow Long"],  p.BlockMASlowL);
            p.BlockMAFastS = num(tv["MA Block Fast Short"], p.BlockMAFastS);
            p.BlockMASlowS = num(tv["MA Block Slow Short"], p.BlockMASlowS);
        }
        if (tvVer === '3.1') {
            // v3.14 compat: alte MA Property-Namen spiegeln
            p.MA1Len = p.MA1LenLong;
            p.MA2Len = p.MA2LenLong;
            p.MA3Len = p.MA1LenShort;
            p.MA4Len = p.MA2LenShort;
        } else {
            // v4.0: v3.1-spezifische Felder entfernen
            delete p.MA1Len; delete p.MA2Len; delete p.MA3Len; delete p.MA4Len;
            delete p.UseMASort2050200L; delete p.UseMASort2050200S;
            delete p.UseMASort102050L;  delete p.UseMASort102050S;
            delete p.SLMode; delete p.AtrPeriod; delete p.AtrMultiplier; delete p.SLHighLowMode;
            delete p.Step5TriggerRLong; delete p.Step5SLRLong;
            delete p.Step6TriggerRLong; delete p.Step6SLRLong;
            delete p.Step5TriggerRShort; delete p.Step5SLRShort;
            delete p.Step6TriggerRShort; delete p.Step6SLRShort;
        }

        // Blockfilter-Mode (Label identisch in v3.1 und v4.0)
        p.BlockModeL   = mapBlockFilterMode(tv["Blockfilter Long Mode"]);
        p.BlockModeS   = mapBlockFilterMode(tv["Blockfilter Short Mode"]);

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

        // ADX
        p.UseADXFilterL = bool(tv["ADX-Filter Long ?"]);
        p.UseADXFilterS = bool(tv["ADX-Filter Short ?"]);
        p.ADXPeriod     = num(tv["ADX Periode"],  p.ADXPeriod);
        p.ADXMin        = num(tv["ADX Minimum"],  p.ADXMin);

        // ATR
        p.UseATRFilterL = bool(tv["ATR-Filter Long ?"]);
        p.UseATRFilterS = bool(tv["ATR-Filter Short ?"]);
        p.ATRPeriod     = num(tv["ATR Periode"],   p.ATRPeriod);
        p.ATRMinPips    = num(tv["ATR Min (Pts)"], p.ATRMinPips);
        p.ATRMaxPips    = num(tv["ATR Max (Pts)"], p.ATRMaxPips);

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
        try {
            const tv = extractSettings(modal);
            log(`Extracted ${Object.keys(tv).length} settings from strategy modal`);

            const tvVer = detectTvVersion(tv);
            const targetBotVer = tvVer === '3.1' ? '3.14' : '4.0';
            log(`Detected TiL version: ${tvVer} → target cBot: v${targetBotVer}`);

            const parameters = mapTvToConfig(tv);
            log("Mapped TV settings to cTrader parameters");

            logTable(`cT Export (TiL v${tvVer} → cBot v${targetBotVer}) — Gemappte Parameter`,
                Object.entries(parameters).map(([k, v]) => ({ Parameter: k, Wert: String(v).substring(0, 60) })));

            const chart = buildChartSection(tv);
            log(`Chart section: Symbol=${chart.Symbol}, Period=${chart.Period}`);

            const cbotset = { Chart: chart, Parameters: parameters };

            const jsonStr = JSON.stringify(cbotset, null, 2);
            const blob = new Blob([jsonStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;

            const sym = cbotset.Chart.Symbol || "unknown";
            const per = cbotset.Chart.Period || "h1";
            const filename = `Oldman Strategie v${targetBotVer}, ${sym} ${per}.cbotset`;
            a.download = filename;

            log(`Downloading: ${filename}`);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            log("=== CTRADER EXPORT COMPLETE ===");
            alert(`✓ cTrader Export erfolgreich!\n\nDatei: ${filename}\n📌 Diese Datei ist für cBot v${targetBotVer}\n\n⚠ Bitte manuell in cTrader setzen:\n- WE-Endzeit (WeekendCloseTimeStr)\n- Abend-Endzeit (EveningCloseTimeStr)\n- Feiertag-Schließzeit (HolidayCloseTimeStr)\n→ Format HH:MM:SS, reale Schließzeit (nicht Kerzenzeit!)`);
        } catch (err) {
            log(`⛔ EXPORT FEHLER: ${err.message}`, err);
            alert(`⛔ cTrader Export fehlgeschlagen!\n\n${err.message}\n\nDetails in der Browser-Konsole (F12).`);
        }
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
        // TradingView translates Pine Script 'None' → 'Ohne' in the UI
        const modes = ["Ohne", "Below Fast", "Below Slow", "Below Any", "Below Both", "Between Fast&Slow"];
        return modes[val] ?? "Ohne";
    }

    function reverseBlockFilterModeShort(val) {
        // TradingView translates Pine Script 'None' → 'Ohne' in the UI
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
    function mapConfigToTv(config, tvVer = '4.0') {
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

        const maxStep = tvVer === '3.1' ? 6 : 4;
        for (let i = 1; i <= maxStep; i++) {
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

        const botVer = detectVersion(config);
        log(`Detected cbotset version: ${botVer}, TiL version: ${tvVer}`);

        if (tvVer === '3.1') {
            // TiL v3.1: Feldbezeichnungen ohne "?", alte MA-Namen
            tv["Trendfilter Long"]  = config.UseMAFilterL;
            tv["Trendfilter Short"] = config.UseMAFilterS;

            // MA-Werte: v3.14 cbotset hat MA1Len/MA2Len/MA3Len/MA4Len
            tv["MA1"] = String(botVer === '3.14' ? (config.MA1Len ?? 50)  : (config.MA1LenLong  ?? 50));
            tv["MA2"] = String(botVer === '3.14' ? (config.MA2Len ?? 200) : (config.MA2LenLong  ?? 200));
            tv["MA3"] = String(botVer === '3.14' ? (config.MA3Len ?? 200) : (config.MA1LenShort ?? 200));
            tv["MA4"] = String(botVer === '3.14' ? (config.MA4Len ?? 50)  : (config.MA2LenShort ?? 50));

            // Sortierfilter v3.1
            tv["Sortierfilter: Long 20 > 50 > 200"] = config.UseMASort2050200L ?? false;
            tv["Short 200 > 50 > 20"]                = config.UseMASort2050200S ?? false;
            tv["Sortierfilter: Long 10 > 20 > 50"]  = config.UseMASort102050L  ?? false;
            tv["Short 50 > 20 > 10"]                 = config.UseMASort102050S  ?? false;

            // SL-Modus und ATR-SL v3.1
            tv["SL Modus"]           = reverseSlMode(config.SLMode ?? 0);
            tv["ATR-Periode"]        = config.AtrPeriod    ?? 14;
            tv["ATR-Multiplikator"]  = config.AtrMultiplier ?? 1.0;

            // Blockfilter-MAs v3.1
            tv["MA Fast Long"]  = String(config.BlockMAFastL);
            tv["MA Slow Long"]  = String(config.BlockMASlowL);
            tv["MA Fast Short"] = String(config.BlockMAFastS);
            tv["MA Slow Short"] = String(config.BlockMASlowS);
        } else {
            // TiL v4.0
            tv["Trendfilter Long ?"]  = config.UseMAFilterL;
            tv["Trendfilter Short ?"] = config.UseMAFilterS;

            if (botVer === '3.14') {
                tv["MA Trend Long 1"]  = String(config.MA1Len  ?? 50);
                tv["MA Trend Long 2"]  = String(config.MA2Len  ?? 200);
                tv["MA Trend Long 3"]  = "0";
                tv["MA Trend Short 1"] = String(config.MA3Len  ?? 200);
                tv["MA Trend Short 2"] = String(config.MA4Len  ?? 50);
                tv["MA Trend Short 3"] = "0";
            } else {
                tv["MA Trend Long 1"]  = String(config.MA1LenLong  ?? 50);
                tv["MA Trend Long 2"]  = String(config.MA2LenLong  ?? 200);
                tv["MA Trend Long 3"]  = String(config.MA3LenLong  ?? 0);
                tv["MA Trend Short 1"] = String(config.MA1LenShort ?? 200);
                tv["MA Trend Short 2"] = String(config.MA2LenShort ?? 50);
                tv["MA Trend Short 3"] = String(config.MA3LenShort ?? 0);
            }

            // Blockfilter-MAs v4.0
            tv["MA Block Fast Long"]  = String(config.BlockMAFastL);
            tv["MA Block Slow Long"]  = String(config.BlockMASlowL);
            tv["MA Block Fast Short"] = String(config.BlockMAFastS);
            tv["MA Block Slow Short"] = String(config.BlockMASlowS);
        }

        // Blockfilter-Mode (Label identisch in v3.1 und v4.0)
        tv["Blockfilter Long Mode"]  = reverseBlockFilterModeLong(config.BlockModeL);
        tv["Blockfilter Short Mode"] = reverseBlockFilterModeShort(config.BlockModeS);

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

        // ADX
        tv["ADX-Filter Long ?"]  = config.UseADXFilterL;
        tv["ADX-Filter Short ?"] = config.UseADXFilterS;
        tv["ADX Periode"]        = config.ADXPeriod;
        tv["ADX Minimum"]        = config.ADXMin;

        // ATR
        tv["ATR-Filter Long ?"]  = config.UseATRFilterL;
        tv["ATR-Filter Short ?"] = config.UseATRFilterS;
        tv["ATR Periode"]        = config.ATRPeriod;
        tv["ATR Min (Pts)"]      = config.ATRMinPips;
        tv["ATR Max (Pts)"]      = config.ATRMaxPips;

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

                    // TiL-Version aus dem geöffneten Dialog erkennen
                    const currentTv = extractSettings(modal);
                    const tvVer = detectTvVersion(currentTv);
                    log(`Detected TiL version for import: ${tvVer}`);

                    // cBot-Version aus der Datei erkennen und auf Mismatch prüfen
                    const botVer = detectVersion(cbotset.Parameters);
                    log(`Detected cBot version in file: ${botVer}`);
                    const expectedBotVer = tvVer === '3.1' ? '3.14' : '4.0';
                    if (botVer !== expectedBotVer) {
                        alert(`⚠ Versions-Konflikt!\n\nDu verwendest Strategietester/Alarm v${tvVer}, aber die Datei stammt von cBot v${botVer}.\n\nErlaubte Kombinationen:\n• Strategietester/Alarm v3.1  →  cBot v3.14\n• Strategietester/Alarm v4.0  →  cBot v4.0\n\nBitte passende Datei laden.`);
                        resolve(0);
                        return;
                    }

                    const tvSettings = mapConfigToTv(cbotset.Parameters, tvVer);

                    let imported = 0;
                    let failed = [];
                    const written = [];

                    const checkboxEntries = [];
                    const inputEntries = [];
                    const comboEntries = [];

                    log("Searching for controls in modal...");
                    for (const [label, value] of Object.entries(tvSettings)) {
                        const control = findControlByLabel(modal, label);

                        if (!control) {
                            failed.push({ Feld: label, Status: '✗ NICHT GEFUNDEN', Wert: String(value).substring(0, 50) });
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
                        if (success) { imported++; written.push({ Feld: label, Status: '✓ GESCHRIEBEN', Wert: String(value).substring(0, 50) }); }
                        else { failed.push({ Feld: label, Status: '✗ FEHLER', Wert: String(value).substring(0, 50) }); }
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }

                    for (const [label, value, control] of comboEntries) {
                        log(`Processing combobox: ${label}`);
                        const success = await setComboboxValue(control, value);
                        if (success) { imported++; written.push({ Feld: label, Status: '✓ GESCHRIEBEN', Wert: String(value).substring(0, 50) }); }
                        else { failed.push({ Feld: label, Status: '✗ FEHLER', Wert: String(value).substring(0, 50) }); }
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }

                    if (inputEntries.length > 0 || comboEntries.length > 0) {
                        log('Waiting before setting checkboxes...');
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }

                    for (const [label, value, control] of checkboxEntries) {
                        log(`Processing checkbox: ${label}`);
                        const success = await setInputValue(control, value);
                        if (success) { imported++; written.push({ Feld: label, Status: '✓ GESCHRIEBEN', Wert: String(value).substring(0, 50) }); }
                        else { failed.push({ Feld: label, Status: '✗ FEHLER', Wert: String(value).substring(0, 50) }); }
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }

                    document.body.removeChild(overlay);

                    log(`✓ cTrader Import Complete: ${imported} successful, ${failed.length} failed`);
                    logTable(`cT Import (cBot v${botVer} → TiL v${tvVer}) — Feldübersicht`, [...written, ...failed]);

                    alert(`✓ cTrader Import erfolgreich!\n\n${imported} Settings wurden übertragen.\n\n⚠ Bitte manuell in TradingView setzen:\n- WE-Endzeit\n- Abend-Endzeit\n- Early-Close Zeit\n→ Kerzenzeit des jeweiligen Timeframes!`);

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