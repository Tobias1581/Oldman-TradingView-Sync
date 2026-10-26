// ==UserScript==
// @name         Oldman TradingView Sync & Export
// @version      4.086
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

    // Sammelt beim cT Export, was nicht übertragen werden konnte (null = gerade kein Export)
    let exportIssues = null;

    function splitPair(raw, label) {
        if (!raw || typeof raw !== "string") return { left: null, right: null };
        // Komma ist hier kein Dezimalzeichen: „20,30“ wäre sonst still 20.3 (die Strategie nimmt dann ihren Ersatzwert)
        if (/,/.test(raw) || raw.split("/").length > 2) {
            if (exportIssues && label) exportIssues.unreadable.push(`${label}: „${raw}“`);
            return { left: null, right: null };
        }
        const parts = raw.split("/");
        const res = parts.length === 1
            ? { left: num(parts[0], null), right: num(parts[0], null) }
            : { left: num(parts[0], null), right: num(parts[1], null) };
        if (exportIssues && label && (res.left === null || res.right === null)) exportIssues.unreadable.push(`${label}: „${raw}“`);
        return res;
    }

    // Fehlerliste für Meldungen: höchstens max Zeilen, Rest steht in der Konsole
    function formatIssueList(lines, max = 15) {
        const shown = lines.slice(0, max).map(l => "  - " + l);
        if (lines.length > max) shown.push(`  … und ${lines.length - max} weitere (Browser-Konsole F12)`);
        return shown.join("\n");
    }

    const bool = v => v === true;

    // Seit 4.1: Feldnamen von Strategie 4.1/5.1 und Alarm 4.1 (25.10.2026). Hier stehen NUR alte Namen aus
    // veröffentlichten Fassungen (Strategie 4.0–4.03/5.03, Alarm 4.0/4.03, Userscript 4.082) → heutiger Name.
    // Namen aus nie veröffentlichten Zwischenständen (4.1/5.1, a, b) sind bewusst nicht mehr drin.
    const LABEL_ALIAS = {
        "Enddatum": "Backtest Enddatum",
        "Session-Fenster": "Session-Zeiten",
        "Trades vor Wochenende schließen?": "Wochenende schließen",
        "WE-Endzeit": "Wochenende Schließzeit (Kerze)",
        "Trades am Abend schließen?": "Abend schließen",
        "Abend-Endzeit": "Abend Schließzeit (Kerze)",
        "Early-Close Zeit": "US-Halbtage Schließzeit (Kerze)",
        "Gleitender Durchschnitt MA-Mode": "MA-Berechnung",
        "Oldman Gold Long ?": "Strategie-Logik Long",
        "Oldman Gold Short ?": "Strategie-Logik Short",
        "Regel 1L": "R1L",
        "Regel 2L": "R2L",
        "Regel 3L": "R3L",
        "Regel 4L (200)": "R4L-200",
        "Regel 4L (50)": "R4L-50",
        "Regel 1S": "R1S",
        "Regel 2S": "R2S",
        "Regel 3S": "R3S",
        "Regel 4S (200)": "R4S-200",
        "Regel 4S (50)": "R4S-50",
        "SL Körper Long ?": "SL an Kerzenkörper Long",
        "SL Körper Short ?": "SL an Kerzenkörper Short",
        "Kerzenteilung Long ?": "Kerzenteilung Long",
        "Kerzenteilung Short ?": "Kerzenteilung Short",
        "S2": "Schwelle 2 (Pts)",
        "S3": "Schwelle 3 (Pts)",
        "F2": "Teilungsfaktor 2",
        "F3": "Teilungsfaktor 3",
        "SL Nachziehen Long ?": "Trailing-SL Long",
        "SL Nachziehen Short ?": "Trailing-SL Short",
        "1. Schritt (R)": "1. SL-Level (R)",
        "2. Schritt (R)": "2. SL-Level (R)",
        "3. Schritt (R)": "3. SL-Level (R)",
        "4. Schritt (R)": "4. SL-Level (R)",
        "Zeit Short": "Ausschlusszeiten Short",
        "Tage Short": "Ausschlusstage Short",
        "Kerze min (Pts)": "Min. Kerzengröße (Pts)",
        "Kerze max (Pts)": "Max. Kerzengröße (Pts)",
        "Dominant Engulfing Long ?": "Dominant Engulfing Long",
        "Dominant Engulfing Short ?": "Dominant Engulfing Short",
        "Trendfilter Long ?": "Trendfilter Long",
        "Trendfilter Short ?": "Trendfilter Short",
        "Blockfilter Long Mode": "Blockfilter Long",
        "MA Block Fast Long": "Block-MA Fast Long",
        "MA Block Slow Long": "Block-MA Slow Long",
        "Blockfilter Short Mode": "Blockfilter Short",
        "MA Block Fast Short": "Block-MA Fast Short",
        "MA Block Slow Short": "Block-MA Slow Short",
        "RSI-Filter Long ?": "RSI-Filter Long",
        "RSI-Filter Short ?": "RSI-Filter Short",
        "RSI-Länge": "RSI Periode",
        "RSI Long: min": "RSI Long Min",
        "RSI Long: max": "RSI Long Max",
        "RSI Short: min": "RSI Short Min",
        "RSI Short: max": "RSI Short Max",
        "MACD-Filter Long ?": "MACD-Filter Long",
        "MACD-Filter Short ?": "MACD-Filter Short",
        "MACD-Signal": "MACD Signal Periode",
        "MACD-Fast": "MACD Fast Periode",
        "MACD-Slow": "MACD Slow Periode",
        "StochRSI-Filter Long ?": "StochRSI Long",
        "StochRSI-Filter Short ?": "StochRSI Short",
        "SRSI Max (Long)": "StochRSI Max Long",
        "SRSI Min (Short)": "StochRSI Min Short",
        "ADX-Filter Long ?": "ADX-Filter Long",
        "ADX-Filter Short ?": "ADX-Filter Short",
        "ATR-Filter Long ?": "ATR-Filter Long",
        "ATR-Filter Short ?": "ATR-Filter Short",
        "Ausschlussgründe anzeigen?": "Ausschlussgründe anzeigen",
        "Session-Zeiten einfärben?": "Session-Zeiten einfärben",
        "Balkenlupe-Hinweis anzeigen?": "Balkendetaillierung-Hinweis anzeigen",
        "Balkendetaillierung-Hinweis anzeigen?": "Balkendetaillierung-Hinweis anzeigen",
        "Engulfings nur in Session anzeigen?": "Engulfings nur in Session anzeigen",
        "Setups einzeichnen?": "Setups einzeichnen",
        "Linien Last High/Last Low anzeigen?": "Linien Last High/Last Low anzeigen",
        "DE Lookback L": "DE Lookback Long",
        "DE Lookback S": "DE Lookback Short",
        "DE Vergleich L": "DE Vergleich Long",
        "DE Vergleich S": "DE Vergleich Short"
    };
    const normLabel = l => LABEL_ALIAS[l] || l;
    // Auch für Schlüssel mit " #2" usw.
    const normKey = k => { const m = k.match(/^(.*) (#\d+)$/); return m ? `${normLabel(m[1])} ${m[2]}` : normLabel(k); };

    function findLabelForControl(control, root) {
        if (control.type === "checkbox") {
            const lab = control.closest("label");
            if (lab) {
                const txt = clean(lab.innerText);
                if (txt) return normLabel(txt);
            }
        }
        let cur = control.parentElement;
        while (cur && cur !== root) {
            const sib = cur.previousElementSibling;
            if (sib && !sib.querySelector("input, button[role='combobox']")) {
                const txt = clean(sib.innerText);
                if (txt) return normLabel(txt);
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

    // Schließzeiten NIE übertragen: TradingView rechnet mit Kerzenzeit, cTrader mit realer
    // Schließzeit – müssen auf beiden Seiten von Hand gesetzt werden.
    // cT Export: Felder, die nur alte (3.1) bzw. nur Test-Skripte (5.x) haben – fehlen sie, ist das kein Fehler
    const EXPORT_OPTIONAL = ["Backtest auf dem M15 ?", "Trendfilter Long", "MA1", "MA2", "MA3", "MA4",
        "Sortierfilter: Long 20 > 50 > 200", "Short 200 > 50 > 20", "Sortierfilter: Long 10 > 20 > 50", "Short 50 > 20 > 10",
        "SL Modus", "ATR-Periode", "ATR-Multiplikator", "MA Fast Long", "MA Slow Long", "MA Fast Short", "MA Slow Short"];
    const EXPORT_ONLY_V5 = ["Dominant Engulfing Long", "Dominant Engulfing Short", "DE Lookback Long", "DE Lookback Short",
        "DE Vergleich Long", "DE Vergleich Short", "ADX-Filter Long", "ADX-Filter Short", "ADX Periode", "ADX Minimum",
        "ATR-Filter Long", "ATR-Filter Short", "ATR Periode", "ATR Min (Pts)", "ATR Max (Pts)"];
    const NEVER_TRANSFER = ["Wochenende Schließzeit (Kerze)", "Abend Schließzeit (Kerze)", "US-Halbtage Schließzeit (Kerze)"];

    // Alle Felder für die Sicherung in der .cbotset (seit 4.1), ohne NEVER_TRANSFER.
    // Doppelte Feldnamen bekommen " #2", " #3" … angehängt, damit keins verloren geht.
    function extractAllSettings(modal) {
        const all = {};
        const seen = {};
        modal.querySelectorAll("input, button[role='combobox']").forEach(control => {
            if (control.type === "hidden") return;
            const label = findLabelForControl(control, modal);
            if (!label) return;
            if (NEVER_TRANSFER.includes(label)) return;
            let value;
            if (control.tagName === "INPUT") {
                value = control.type === "checkbox" ? control.checked : clean(control.value);
            } else if (control.tagName === "BUTTON") {
                value = clean(control.innerText);
            }
            if (value === undefined) return;
            seen[label] = (seen[label] || 0) + 1;
            all[seen[label] === 1 ? label : `${label} #${seen[label]}`] = value;
        });
        return all;
    }

    function findControlByLabel(modal, labelText, nth = 1) {
        const controls = modal.querySelectorAll("input, button[role='combobox']");
        let hit = 0;
        for (const control of controls) {
            const label = findLabelForControl(control, modal);
            if (label === normLabel(labelText) && ++hit === nth) {
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
            "Strategie-Logik Long",
            "Strategie-Logik Short",
            "R1L", "R2L", "R3L", "R4L-200", "R4L-50",
            "R1S", "R2S", "R3S", "R4S-200", "R4S-50",
            "MA-Toleranz (Pts)",
            "Hammerdocht (%)",

            // 02 - Trade & CRV / SL
            "Trade-Richtung",
            "CRV Long", "CRV Short",
            "Entry-Offset (Pts)", "SL-Offset (Pts)",
            "SL an Kerzenkörper Long", "SL an Kerzenkörper Short",
            "Kerzenteilung Long", "Kerzenteilung Short",
            "Teilungsfaktor 1", "Teilungsfaktor 2", "Teilungsfaktor 3",
            "Schwelle 1 (Pts)", "Schwelle 2 (Pts)", "Schwelle 3 (Pts)",

            // 03 - Session
            "Zeitzone (UTC)",
            "US-Zeitumstellung",
            "Session-Zeiten",
            "Freitag: letzte Kerze",
            "Ausschlusszeiten Long", "Ausschlusszeiten Short",
            "Ausschlusstage Long", "Ausschlusstage Short",

            // 04 - Kerzenform
            "Min. Kerzengröße (Pts)", "Max. Kerzengröße (Pts)",
            "Trend-Docht (%)", "Gegen-Docht (%)",
            "Körper min (%)", "Engulfing Growth (%)",

            // 05 - MA-Berechnung (alter Name per LABEL_ALIAS)
            "MA-Berechnung",

            // 06 - Blockfilter (alter Name per LABEL_ALIAS)
            "Blockfilter Long",
            "Blockfilter Short",

            // 07 - Indikatoren (Bezeichnungen identisch)
            "RSI-Filter Long", "RSI-Filter Short", "RSI Periode",
            "RSI Long Min", "RSI Long Max",
            "RSI Short Min", "RSI Short Max",
            "MACD-Filter Long", "MACD-Filter Short",
            "MACD Fast Periode", "MACD Slow Periode", "MACD Signal Periode",
            "StochRSI Long", "StochRSI Short",
            "StochRSI Max Long", "StochRSI Min Short",
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
                "Trailing-SL Long", "Trailing-SL Short",
                "1. Trigger (R)", "1. SL-Level (R)",
                "2. Trigger (R)", "2. SL-Level (R)",
                "3. Trigger (R)", "3. SL-Level (R)",
                "4. Trigger (R)", "4. SL-Level (R)",
                "5. Trigger (R)", "5. SL-Level (R)",
                "6. Trigger (R)", "6. SL-Level (R)"
            );
        } else {
            fieldsToExport.push(
                // Trendfilter v4.0 (mit ?)
                "Trendfilter Long", "Trendfilter Short",
                "MA Trend Long 1", "MA Trend Long 2", "MA Trend Long 3",
                "MA Trend Short 1", "MA Trend Short 2", "MA Trend Short 3",
                // Blockfilter-MAs v4.0
                "Block-MA Fast Long", "Block-MA Slow Long",
                "Block-MA Fast Short", "Block-MA Slow Short",
                // ADX/ATR-Filter v4.0 (silent, weil im UI ausgeblendet)
                "ADX-Filter Long", "ADX-Filter Short", "ADX Periode", "ADX Minimum",
                "ATR-Filter Long", "ATR-Filter Short", "ATR Periode", "ATR Min (Pts)", "ATR Max (Pts)"
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
            "MA-Berechnung",
            "Freitag: letzte Kerze",   // erst ab Strategie 4.1/5.1 – ältere Strategie: still überspringen
            "ADX-Filter Long", "ADX-Filter Short", "ADX Periode", "ADX Minimum",
            "ATR-Filter Long", "ATR-Filter Short", "ATR Periode", "ATR Min (Pts)", "ATR Max (Pts)"
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
            if (typeof value !== "boolean") value = /^(true|oldman gold)$/i.test(String(value).trim()); // Strategie-Logik → altes Häkchen
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
        if (typeof value === "boolean") value = value ? "Oldman Gold" : "Oldman Standard"; // altes Häkchen „Oldman Gold … ?“ → Strategie-Logik

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
            alert("Keine Strategie-Einstellungen gefunden!\nBitte zuerst in der Strategie (Oldman Strategie TiL) 'Copy to Alarm' klicken.");
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
                alert(`⚠ Versionskonflikt!\n\nDie kopierten Einstellungen stammen von Strategie-Familie v${savedVer}, du verwendest aber Alarm-Familie v${targetVer}.\n\nErlaubte Kombinationen:\n• Strategie v3.1 → Alarm v3.1\n• Strategie v4.x/v5.x (Engulfing Setup Strategy) → Alarm v4.x (Engulfing Setup Alerts)`);
                return 0;
            }
        }

        let imported = 0;
        let failed = [];
        const written = [];

        // Alarm hat nie 5.x-Felder (Dominant Engulfing, ADX, ATR) – nicht versuchen, nicht melden
        const entries = Object.entries(settings).filter(([k]) => k !== '_tilVersion' && !EXPORT_ONLY_V5.includes(k));
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

        if (imported > 0 || failed.length) {
            alert(`${failed.length ? "⚠" : "✓"} Import ${imported > 0 ? "abgeschlossen" : "fehlgeschlagen"}!\n\n${imported} Settings wurden übertragen.` +
                (failed.length ? `\n\n⚠ ${failed.length} Werte nicht übertragen:\n` +
                    formatIssueList(failed.map(f => `${f.Feld} = ${f.Wert} (${f.Status.includes("GEFUNDEN") ? "Feld nicht gefunden" : "nicht übernommen"})`)) : ""));
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

    // Strategie-Logik aus TradingView: Auswahl „Oldman Gold“/„Oldman Standard“ (ab 4.1) oder altes Häkchen (true/false)
    function mapStrategyFromTv(v) {
        if (v === undefined || typeof v === "boolean") return mapStrategyFromGoldFlag(v === true);
        return /standard/i.test(String(v)) ? 0 : 1;
    }

    // Dominant Engulfing Vergleich: Close = 0, Docht = 1 (Enum-Reihenfolge im Bot)
    function mapDomEngSource(str) {
        if (!str) return 0;
        return str.trim().toLowerCase() === "docht" ? 1 : 0;
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

    // ============================================================
    //  CTRADER EXPORT - BROKER-AUSWAHL (seit 4.1)
    //  Symbolnamen je Prop-Firm laut Trading-Grundlagen, Tabelle
    //  "Gleicher Markt, verschiedene Kürzel" (Stand 08.10./11.10.2026).
    //  Nicht gelistete Symbole: TradingView-Name ohne Anhängsel.
    // ============================================================
    const BROKER_KEY = 'oldman_ctrader_broker';
    // freigegeben: false = bleibt im Code (Namensliste unten), erscheint aber nicht im Auswahlfeld.
    // Zum Freischalten einfach auf true setzen.
    const brokerList = [
        { id: "FTMO",         label: "FTMO",            freigegeben: true  },
        { id: "TTP",          label: "The Trading Pit", freigegeben: true  },
        { id: "BrightFunded", label: "BrightFunded",    freigegeben: false },
        { id: "FundingPips",  label: "FundingPips",     freigegeben: false },
        { id: "E8",           label: "E8",              freigegeben: false },
        { id: "Andere",       label: "Anderer Broker",  freigegeben: false }
    ];
    const tvIndexAlias = {
        "NAS100": "US100", "SPX500": "US500", "DAX": "GER40", "DE40": "GER40"
    };
    const brokerSymbolMap = {
        TTP:          { US30: "US30",      US100: "USTEC",      US500: "US500",      GER40: "DE40",       JP225: "JP225",       UK100: "UK100" },
        BrightFunded: { US30: "US30.cash", US100: "US100.cash", US500: "US500.cash", GER40: "GER30.cash", JP225: "JAP225.cash", UK100: "UK100.cash" },
        FundingPips:  { US30: "DJIUSD",    US100: "NDXUSD",     US500: "SPXUSD",     GER40: "GEREUR",     JP225: "JPNJPY",      UK100: "FTSEGBP" },
        E8:           { US30: "DOW+",      US100: "NSDQ+",      US500: "SP+",        GER40: "DAX+",       JP225: "NIKKEI+" }
    };

    function getBroker() {
        let id = "";
        try { id = localStorage.getItem(BROKER_KEY) || ""; } catch (e) { return ""; }
        // Gemerkter, aber (nicht mehr) freigegebener Broker zählt als "nicht gewählt"
        return brokerList.some(b => b.id === id && b.freigegeben) ? id : "";
    }
    function setBroker(id) {
        try { localStorage.setItem(BROKER_KEY, id); } catch (e) {}
    }

    // Pop-up beim cT Export: Für welchen Broker ist die Datei? Zuletzt gewählter Broker ist hervorgehoben.
    // Ergebnis: Broker-ID oder "" (abgebrochen)
    function askBroker() {
        return new Promise(resolve => {
            const last = getBroker();
            const overlay = document.createElement("div");
            overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;justify-content:center;align-items:center;z-index:100000;";
            const box = document.createElement("div");
            box.style.cssText = "background:#2E3A47;color:#fff;padding:24px 28px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.5);font-size:15px;min-width:300px;text-align:center;";
            box.innerHTML = `<div style="font-weight:bold;font-size:17px;margin-bottom:8px;">cTrader-Datei für welchen Broker?</div>` +
                `<div style="font-size:13px;opacity:0.8;margin-bottom:16px;">Davon hängt der Symbolname ab (z. B. US30.cash bei FTMO, US30 bei TTP).</div>`;
            const row = document.createElement("div");
            row.style.cssText = "display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:14px;";
            const close = id => {
                document.removeEventListener("keydown", onKey, true);
                overlay.remove();
                resolve(id);
            };
            brokerList.filter(b => b.freigegeben).forEach(b => {
                const btn = document.createElement("button");
                btn.textContent = b.label;
                const sel = b.id === last;
                btn.style.cssText = `padding:8px 16px;border-radius:6px;cursor:pointer;color:#fff;font:inherit;font-weight:bold;` +
                    `background:${sel ? "#1976D2" : "transparent"};border:2px solid #2196F3;`;
                btn.addEventListener("click", () => { setBroker(b.id); log(`Broker gewählt: ${b.id}`); close(b.id); });
                row.appendChild(btn);
            });
            const cancel = document.createElement("button");
            cancel.textContent = "Abbrechen";
            cancel.style.cssText = "padding:4px 12px;border-radius:6px;cursor:pointer;color:#ccc;background:transparent;border:1px solid #777;font:inherit;font-size:13px;";
            cancel.addEventListener("click", () => close(""));
            const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); close(""); } };
            document.addEventListener("keydown", onKey, true);
            overlay.addEventListener("click", e => { if (e.target === overlay) close(""); });
            box.appendChild(row);
            box.appendChild(cancel);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
        });
    }

    function mapToBrokerSymbol(tvSymbolRaw, broker) {
        if (broker === "FTMO") return mapToFtmoSymbol(tvSymbolRaw);
        const tv = normalizeTvSymbol(tvSymbolRaw);
        if (!tv) return null;
        const canon = tvIndexAlias[tv] || tv;
        const map = brokerSymbolMap[broker];
        if (map && map[canon]) return map[canon];
        return tv;
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

    function buildChartSection(tv, broker) {
        const tvSymbolRaw = getTradingViewSymbol();
        const fromUrl     = getPeriodFromUrl();
        const fromToolbar = getPeriodFromToolbar();
        const fromFlags   = getPeriodFromBacktestFlags(tv);
        const period = fromUrl ?? fromToolbar ?? fromFlags;
        log(`Period sources — URL: ${fromUrl}, Toolbar: ${fromToolbar}, Flags: ${fromFlags} → using: ${period}`);
        return {
            Symbol: mapToBrokerSymbol(tvSymbolRaw, broker),
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
        // Primär: explizites Versions-Dropdown (seit v4.0)
        const ver = tv["Skript-Version"];
        if (ver) {
            if (ver.startsWith("v3")) return '3.1';
            if (ver.startsWith("v4")) return '4.0';
            if (ver.startsWith("v5")) return '4.0'; // Test-Linie 5.x = gleicher Code wie 4.x (sonst griffe unten der 3.1-Fallback über „Trendfilter Long“)
        }
        // Fallback für v3.1 (kein Versions-Dropdown vorhanden)
        if (tv["Backtest auf dem M15 ?"] !== undefined) return '3.1'; // Strategietester v3.1
        if (tv["Trendfilter Long"] !== undefined) return '3.1';       // Alarm v3.1
        if (tv["MA1"] !== undefined) return '3.1';                    // Fallback v3.1
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
            UsDstShift: true,
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
            // Dominant Engulfing (Bot v5.x; in v4.x fest aus)
            UseDominantEngulfingLong: false,
            DominantEngulfingLookbackLong: 4,
            DominantEngulfingSourceLong: 0,
            UseDominantEngulfingShort: false,
            DominantEngulfingLookbackShort: 4,
            DominantEngulfingSourceShort: 0,

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
        p.StrategyLong = mapStrategyFromTv(tv["Strategie-Logik Long"]);
        p.StrategyShort = mapStrategyFromTv(tv["Strategie-Logik Short"]);

        // Regeln
        p.EnableRule1Long = bool(tv["R1L"]);
        p.EnableRule2Long = bool(tv["R2L"]);
        p.EnableRule3Long = bool(tv["R3L"]);
        p.EnableRule4MA200Long = bool(tv["R4L-200"]);  // ← v3.1
        p.EnableRule4MA50Long  = bool(tv["R4L-50"]);   // ← v3.1

        p.EnableRule1Short = bool(tv["R1S"]);
        p.EnableRule2Short = bool(tv["R2S"]);
        p.EnableRule3Short = bool(tv["R3S"]);
        p.EnableRule4MA200Short = bool(tv["R4S-200"]); // ← v3.1
        p.EnableRule4MA50Short  = bool(tv["R4S-50"]);  // ← v3.1

        // MA Toleranz
        {
            const pairBuf = splitPair(tv["MA-Toleranz (Pts)"], "MA-Toleranz (Pts)");
            if (pairBuf.left  !== null) p.Rule4MABufferLong  = pairBuf.left;   // ← v3.1
            if (pairBuf.right !== null) p.Rule4MABufferShort = pairBuf.right;  // ← v3.1
        }

        // Hammerdocht (Pair-String "L/S")
        {
            const pairHammer = splitPair(tv["Hammerdocht (%)"], "Hammerdocht (%)");
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
            const pairEntry = splitPair(tv["Entry-Offset (Pts)"], "Entry-Offset (Pts)");
            if (pairEntry.left  !== null) p.EntryOffsetLong  = pairEntry.left;
            if (pairEntry.right !== null) p.EntryOffsetShort = pairEntry.right;
        }

        // SL-Offset
        {
            const pairSl = splitPair(tv["SL-Offset (Pts)"], "SL-Offset (Pts)");
            if (pairSl.left  !== null) p.SLOffsetLong  = pairSl.left;
            if (pairSl.right !== null) p.SLOffsetShort = pairSl.right;
        }

        // Kerzenteilung = UseCandleSplit
        p.UseCandleSplitLong  = bool(tv["Kerzenteilung Long"]);
        p.UseCandleSplitShort = bool(tv["Kerzenteilung Short"]);

        p.SLUseBodyOpenLong  = bool(tv["SL an Kerzenkörper Long"]);
        p.SLUseBodyOpenShort = bool(tv["SL an Kerzenkörper Short"]);

        // Schwellen / Faktoren
        {
            const s1 = splitPair(tv["Schwelle 1 (Pts)"], "Schwelle 1 (Pts)");
            const s2 = splitPair(tv["Schwelle 2 (Pts)"], "Schwelle 2 (Pts)");
            const s3 = splitPair(tv["Schwelle 3 (Pts)"], "Schwelle 3 (Pts)");
            const f1 = splitPair(tv["Teilungsfaktor 1"], "Teilungsfaktor 1");
            const f2 = splitPair(tv["Teilungsfaktor 2"], "Teilungsfaktor 2");
            const f3 = splitPair(tv["Teilungsfaktor 3"], "Teilungsfaktor 3");

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
        p.TrailingEnabledLong  = bool(tv["Trailing-SL Long"]);
        p.TrailingEnabledShort = bool(tv["Trailing-SL Short"]);

        function mapStep(idx) {
            const trigLabel = `${idx}. Trigger (R)`;
            const stepLabel = `${idx}. SL-Level (R)`;
            const trigPair = splitPair(tv[trigLabel], trigLabel);
            const stepPair = splitPair(tv[stepLabel], stepLabel);

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
        if (!tv["Session-Zeiten"] || tv["Session-Zeiten"].trim() === "") {
            p.SessionFilterEnabled = false;
            p.SessionWindowStr = "";
        } else {
            p.SessionFilterEnabled = true;
            p.SessionWindowStr = tv["Session-Zeiten"].trim();
        }
        if (tv["Ausschlusszeiten Long"]) p.ExcludeLongStr   = tv["Ausschlusszeiten Long"];
        if (tv["Ausschlusszeiten Short"])            p.ExcludeShortStr  = tv["Ausschlusszeiten Short"];
        if (tv["Ausschlusstage Long"])   p.ExcludeLongDays  = tv["Ausschlusstage Long"];
        if (tv["Ausschlusstage Short"])            p.ExcludeShortDays = tv["Ausschlusstage Short"];
        // US-Zeitumstellung (ab Bot 4.1/5.1, Strategie 4.1/5.1) – nur übertragen, wenn das Skript das Feld hat
        if (tv["US-Zeitumstellung"] !== undefined) p.UsDstShift = bool(tv["US-Zeitumstellung"]);

        // Weekend Close
        p.WeekendCloseEnabled = bool(tv["Wochenende schließen"]);
        // Freitag: letzte Kerze (ab Strategie 4.1/5.1) – gleiche Bedeutung wie im Bot (Startzeit der Signalkerze); ältere Skripte/Alarm ohne Feld → leer
        p.FridayNoEntryAfterStr = tv["Freitag: letzte Kerze"] !== undefined ? String(tv["Freitag: letzte Kerze"]).replace(/\s/g, "") : "";

        p.EveningCloseEnabled = bool(tv["Abend schließen"]);

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
            const minC     = splitPair(tv["Min. Kerzengröße (Pts)"], "Min. Kerzengröße (Pts)");
            const maxC     = splitPair(tv["Max. Kerzengröße (Pts)"], "Max. Kerzengröße (Pts)");
            const trendW   = splitPair(tv["Trend-Docht (%)"], "Trend-Docht (%)");
            const counterW = splitPair(tv["Gegen-Docht (%)"], "Gegen-Docht (%)");
            const bodyMin  = splitPair(tv["Körper min (%)"], "Körper min (%)");
            const engulf   = splitPair(tv["Engulfing Growth (%)"], "Engulfing Growth (%)");

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

        // Dominant Engulfing (nur Strategie v5.x hat die Felder; sonst bleibt es aus)
        p.UseDominantEngulfingLong       = bool(tv["Dominant Engulfing Long"]);
        p.UseDominantEngulfingShort      = bool(tv["Dominant Engulfing Short"]);
        p.DominantEngulfingLookbackLong  = num(tv["DE Lookback Long"], p.DominantEngulfingLookbackLong);
        p.DominantEngulfingLookbackShort = num(tv["DE Lookback Short"], p.DominantEngulfingLookbackShort);
        p.DominantEngulfingSourceLong    = mapDomEngSource(tv["DE Vergleich Long"]);
        p.DominantEngulfingSourceShort   = mapDomEngSource(tv["DE Vergleich Short"]);

        // EMA/MA-Filter (Feldbezeichnungen unterscheiden sich zwischen TiL v3.1 und v4.0)
        p.GlobalMAType = tv["MA-Berechnung"] === "SMA" ? 1 : 0;

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
            p.UseMAFilterL = bool(tv["Trendfilter Long"]);
            p.UseMAFilterS = bool(tv["Trendfilter Short"]);

            p.MA1LenLong  = num(tv["MA Trend Long 1"],  p.MA1LenLong);
            p.MA2LenLong  = num(tv["MA Trend Long 2"],  p.MA2LenLong);
            p.MA3LenLong  = num(tv["MA Trend Long 3"],  p.MA3LenLong);
            p.MA1LenShort = num(tv["MA Trend Short 1"], p.MA1LenShort);
            p.MA2LenShort = num(tv["MA Trend Short 2"], p.MA2LenShort);
            p.MA3LenShort = num(tv["MA Trend Short 3"], p.MA3LenShort);

            // Blockfilter-MAs v4.0
            p.BlockMAFastL = num(tv["Block-MA Fast Long"],  p.BlockMAFastL);
            p.BlockMASlowL = num(tv["Block-MA Slow Long"],  p.BlockMASlowL);
            p.BlockMAFastS = num(tv["Block-MA Fast Short"], p.BlockMAFastS);
            p.BlockMASlowS = num(tv["Block-MA Slow Short"], p.BlockMASlowS);
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
        p.BlockModeL   = mapBlockFilterMode(tv["Blockfilter Long"]);
        p.BlockModeS   = mapBlockFilterMode(tv["Blockfilter Short"]);

        // RSI
        p.UseRSIFilterL = bool(tv["RSI-Filter Long"]);
        p.UseRSIFilterS = bool(tv["RSI-Filter Short"]);
        p.RSILenFilter  = num(tv["RSI Periode"], p.RSILenFilter);

        p.RSILongMin  = num(tv["RSI Long Min"],  p.RSILongMin);
        p.RSILongMax  = num(tv["RSI Long Max"],  p.RSILongMax);
        p.RSIShortMin = num(tv["RSI Short Min"], p.RSIShortMin);
        p.RSIShortMax = num(tv["RSI Short Max"], p.RSIShortMax);

        // MACD
        p.UseMACDFilterL = bool(tv["MACD-Filter Long"]);
        p.UseMACDFilterS = bool(tv["MACD-Filter Short"]);

        p.MACDFast   = num(tv["MACD Fast Periode"],   p.MACDFast);
        p.MACDSlow   = num(tv["MACD Slow Periode"],   p.MACDSlow);
        p.MACDSignal = num(tv["MACD Signal Periode"], p.MACDSignal);

        // StochRSI
        p.UseStochRSIFilterL = bool(tv["StochRSI Long"]);
        p.UseStochRSIFilterS = bool(tv["StochRSI Short"]);

        p.StochUpper = num(tv["StochRSI Max Long"],  p.StochUpper);
        p.StochLower = num(tv["StochRSI Min Short"], p.StochLower);

        // ADX
        p.UseADXFilterL = bool(tv["ADX-Filter Long"]);
        p.UseADXFilterS = bool(tv["ADX-Filter Short"]);
        p.ADXPeriod     = num(tv["ADX Periode"],  p.ADXPeriod);
        p.ADXMin        = num(tv["ADX Minimum"],  p.ADXMin);

        // ATR
        p.UseATRFilterL = bool(tv["ATR-Filter Long"]);
        p.UseATRFilterS = bool(tv["ATR-Filter Short"]);
        p.ATRPeriod     = num(tv["ATR Periode"],   p.ATRPeriod);
        p.ATRMinPips    = num(tv["ATR Min (Pts)"], p.ATRMinPips);
        p.ATRMaxPips    = num(tv["ATR Max (Pts)"], p.ATRMaxPips);

        return p;
    }

    // ============================================================
    //  CTRADER EXPORT - MAIN FUNCTION
    //  Die Datei enthält nur die Strategie-Parameter. Bot-eigene Werte
    //  (Lizenz, Konto, Risiko, Telegram …) fehlen bewusst: cTrader meldet sie
    //  beim Laden als fehlend, nach „Weiter“ behält die Instanz ihre Werte.
    // ============================================================
    async function exportCTraderConfig(modal) {
        log("=== CTRADER EXPORT START ===");
        const broker = await askBroker();
        if (!broker) {
            log("cT Export abgebrochen (kein Broker gewählt)");
            return;
        }
        const brokerLabel = (brokerList.find(b => b.id === broker) || {}).label || broker;
        try {
            const tv = extractSettings(modal);
            log(`Extracted ${Object.keys(tv).length} settings from strategy modal`);

            const tvVer = detectTvVersion(tv);
            const targetBotVer = tvVer === '3.1' ? '3.14' : '4.0';
            log(`Detected TiL version: ${tvVer} → target cBot: v${targetBotVer}`);

            // Mitschreiben, welche Felder die Zuordnung sucht, die es in diesem Skript nicht gibt
            exportIssues = { missing: new Set(), unreadable: [] };
            const isV4 = String(tv["Skript-Version"] || "").startsWith("v4");
            const tvTracked = new Proxy(tv, {
                get(t, k) {
                    if (typeof k === "string" && !(k in t) && !EXPORT_OPTIONAL.includes(k) && !(isV4 && EXPORT_ONLY_V5.includes(k))) exportIssues.missing.add(k);
                    return t[k];
                }
            });
            let parameters;
            try { parameters = mapTvToConfig(tvTracked); } finally { var issues = exportIssues; exportIssues = null; }
            log("Mapped TV settings to cTrader parameters");
            if (issues.missing.size || issues.unreadable.length) log("Nicht übertragen:", [...issues.missing], issues.unreadable);

            logTable(`cT Export (TiL v${tvVer} → cBot v${targetBotVer}) — Gemappte Parameter`,
                Object.entries(parameters).map(([k, v]) => ({ Parameter: k, Wert: String(v).substring(0, 60) })));

            const chart = buildChartSection(tv, broker);
            log(`Chart section: Broker=${broker}, Symbol=${chart.Symbol}, Period=${chart.Period}`);

            // Sicherung aller TradingView-Felder (seit 4.1) – cT Import stellt sie wieder her.
            // Der Bot liest diesen Abschnitt nicht.
            const allFields = extractAllSettings(modal);
            log(`TradingView-Sicherung: ${Object.keys(allFields).length} Felder`);
            const cbotset = {
                Chart: chart,
                Parameters: parameters,
                TradingView: {
                    Hinweis: "Sicherung aller TradingView-Felder fuer cT Import (Oldman TradingView Sync). Wird vom Bot nicht gelesen.",
                    Strategie: tv["Skript-Version"] || `v${tvVer}`,
                    Gesichert: new Date().toISOString(),
                    Felder: allFields
                }
            };

            const jsonStr = JSON.stringify(cbotset, null, 2);
            const blob = new Blob([jsonStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;

            const sym = cbotset.Chart.Symbol || "unknown";
            const per = cbotset.Chart.Period || "h1";
            const brokerTag = broker === "Andere" ? "" : ` (${broker})`;
            const filename = `Oldman Strategie v${targetBotVer}, ${sym} ${per}${brokerTag}.cbotset`;
            a.download = filename;

            log(`Downloading: ${filename}`);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            log("=== CTRADER EXPORT COMPLETE ===");
            alert(`✓ cTrader Export erfolgreich!\n\nDatei: ${filename}\n📌 Diese Datei ist für Oldman Trader v${targetBotVer}\n💾 Zusätzlich gesichert: ${Object.keys(allFields).length} TradingView-Felder für cT Import (ohne Schließzeiten)\n🏦 Broker: ${brokerLabel} – Symbol in der Datei: ${sym}\n   Falsch? Erneut \"cT Export\" klicken und anderen Broker wählen.\n   Heißt das Symbol bei dir anders: Instanz auf dem richtigen Chart anlegen\n   und die Datei dort über \"Parameter laden\" einspielen.\n\n⚠ Bitte manuell in cTrader setzen:\n- Wochenende Schließzeit\n- Abend Schließzeit\n- US-Halbtage Schließzeit\n→ Format HH:MM:SS, reale Schließzeit (nicht Kerzenzeit!)

ℹ Beim Laden in cTrader erscheint „Parameterwarnung … enthält keine Werte“:
   „Weiter“ klicken – Lizenz, Konto, Risiko, Telegram usw. bleiben wie in cTrader.` +
                (issues.unreadable.length ? `\n\n⛔ Nicht übertragen – Wert nicht lesbar (Format 20 oder 20/30, Dezimalpunkt), Bot behält seinen Standard:\n${formatIssueList(issues.unreadable)}` : "") +
                (issues.missing.size ? `\n\n⚠ Nicht übertragen – Feld in dieser Strategie nicht gefunden, Bot behält seinen Standard:\n${formatIssueList([...issues.missing])}` : ""));
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
        return val === 1 ? "Oldman Gold" : "Oldman Standard";
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

    // cbotset kann das Enum als Zahl (1) oder als Name ("Docht") enthalten
    function reverseDomEngSource(val) {
        return (val === 1 || val === "1" || String(val).toLowerCase() === "docht") ? "Docht" : "Close";
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
        tv["Strategie-Logik Long"]  = reverseStrategyMode(config.StrategyLong);
        tv["Strategie-Logik Short"] = reverseStrategyMode(config.StrategyShort);

        // Regeln
        tv["R1L"]     = config.EnableRule1Long;
        tv["R2L"]     = config.EnableRule2Long;
        tv["R3L"]     = config.EnableRule3Long;
        tv["R4L-200"] = config.EnableRule4MA200Long;   // ← v3.1
        tv["R4L-50"]  = config.EnableRule4MA50Long;    // ← v3.1

        tv["R1S"]     = config.EnableRule1Short;
        tv["R2S"]     = config.EnableRule2Short;
        tv["R3S"]     = config.EnableRule3Short;
        tv["R4S-200"] = config.EnableRule4MA200Short;  // ← v3.1
        tv["R4S-50"]  = config.EnableRule4MA50Short;   // ← v3.1

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
        tv["Kerzenteilung Long"]  = config.UseCandleSplitLong;
        tv["Kerzenteilung Short"] = config.UseCandleSplitShort;

        tv["SL an Kerzenkörper Long"]  = config.SLUseBodyOpenLong;
        tv["SL an Kerzenkörper Short"] = config.SLUseBodyOpenShort;

        // Schwellen / Faktoren
        tv["Schwelle 1 (Pts)"] = makePair(config.Threshold1Long, config.Threshold1Short);
        tv["Schwelle 2 (Pts)"]               = makePair(config.Threshold2Long, config.Threshold2Short);
        tv["Schwelle 3 (Pts)"]               = makePair(config.Threshold3Long, config.Threshold3Short);
        tv["Teilungsfaktor 1"] = makePair(config.FactorLowLong,  config.FactorLowShort);
        tv["Teilungsfaktor 2"]               = makePair(config.FactorMidLong,  config.FactorMidShort);
        tv["Teilungsfaktor 3"]               = makePair(config.FactorHighLong, config.FactorHighShort);

        // Trailing
        tv["Trailing-SL Long"]  = config.TrailingEnabledLong;
        tv["Trailing-SL Short"] = config.TrailingEnabledShort;

        const maxStep = tvVer === '3.1' ? 6 : 4;
        for (let i = 1; i <= maxStep; i++) {
            tv[`${i}. Trigger (R)`] = makePair(config[`Step${i}TriggerRLong`],  config[`Step${i}TriggerRShort`]);
            tv[`${i}. SL-Level (R)`] = makePair(config[`Step${i}SLRLong`],       config[`Step${i}SLRShort`]);
        }

        // Session
        tv["Session-Zeiten"]      = config.SessionWindowStr  || "";
        tv["Ausschlusszeiten Long"] = config.ExcludeLongStr   || "";
        tv["Ausschlusszeiten Short"]            = config.ExcludeShortStr  || "";
        tv["Ausschlusstage Long"]   = config.ExcludeLongDays  || "";
        tv["Ausschlusstage Short"]            = config.ExcludeShortDays || "";
        if (config.UsDstShift !== undefined) tv["US-Zeitumstellung"] = config.UsDstShift;

        tv["Freitag: letzte Kerze"] = config.FridayNoEntryAfterStr || "";

        // Weekend Close
        tv["Wochenende schließen"] = config.WeekendCloseEnabled;

        tv["Abend schließen"] = config.EveningCloseEnabled;

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
        tv["Min. Kerzengröße (Pts)"]    = makePair(config.MinCandleLong,   config.MinCandleShort);
        tv["Max. Kerzengröße (Pts)"]    = makePair(config.MaxCandleLong,   config.MaxCandleShort);
        tv["Trend-Docht (%)"]   = makePair(config.WickPctLong,     config.WickPctShort);
        tv["Gegen-Docht (%)"]   = makePair(config.CounterWickPctLong, config.CounterWickPctShort);
        tv["Körper min (%)"]     = makePair(config.BodyMinPctLong,  config.BodyMinPctShort);
        tv["Engulfing Growth (%)"] = makePair(config.MinEngulfingGrowthPercentLong, config.MinEngulfingGrowthPercentShort);

        // Dominant Engulfing – nur übertragen, wenn die Datei die Felder enthält
        if (config.UseDominantEngulfingLong !== undefined) {
            tv["Dominant Engulfing Long"]  = config.UseDominantEngulfingLong;
            tv["DE Lookback Long"]              = config.DominantEngulfingLookbackLong ?? 4;
            tv["DE Vergleich Long"]             = reverseDomEngSource(config.DominantEngulfingSourceLong);
        }
        if (config.UseDominantEngulfingShort !== undefined) {
            tv["Dominant Engulfing Short"] = config.UseDominantEngulfingShort;
            tv["DE Lookback Short"]              = config.DominantEngulfingLookbackShort ?? 4;
            tv["DE Vergleich Short"]             = reverseDomEngSource(config.DominantEngulfingSourceShort);
        }

        // EMA/MA-Filter
        tv["MA-Berechnung"] = config.GlobalMAType === 1 ? "SMA" : "EMA";

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
            tv["Trendfilter Long"]  = config.UseMAFilterL;
            tv["Trendfilter Short"] = config.UseMAFilterS;

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
            tv["Block-MA Fast Long"]  = String(config.BlockMAFastL);
            tv["Block-MA Slow Long"]  = String(config.BlockMASlowL);
            tv["Block-MA Fast Short"] = String(config.BlockMAFastS);
            tv["Block-MA Slow Short"] = String(config.BlockMASlowS);
        }

        // Blockfilter-Mode (Label identisch in v3.1 und v4.0)
        tv["Blockfilter Long"]  = reverseBlockFilterModeLong(config.BlockModeL);
        tv["Blockfilter Short"] = reverseBlockFilterModeShort(config.BlockModeS);

        // RSI
        tv["RSI-Filter Long"]  = config.UseRSIFilterL;
        tv["RSI-Filter Short"] = config.UseRSIFilterS;
        tv["RSI Periode"]           = config.RSILenFilter;

        tv["RSI Long Min"]  = config.RSILongMin;
        tv["RSI Long Max"]  = config.RSILongMax;
        tv["RSI Short Min"] = config.RSIShortMin;
        tv["RSI Short Max"] = config.RSIShortMax;

        // MACD
        tv["MACD-Filter Long"]  = config.UseMACDFilterL;
        tv["MACD-Filter Short"] = config.UseMACDFilterS;

        tv["MACD Fast Periode"]   = config.MACDFast;
        tv["MACD Slow Periode"]   = config.MACDSlow;
        tv["MACD Signal Periode"] = config.MACDSignal;

        // StochRSI
        tv["StochRSI Long"]  = config.UseStochRSIFilterL;
        tv["StochRSI Short"] = config.UseStochRSIFilterS;

        tv["StochRSI Max Long"]  = config.StochUpper;
        tv["StochRSI Min Short"] = config.StochLower;

        // ADX
        tv["ADX-Filter Long"]  = config.UseADXFilterL;
        tv["ADX-Filter Short"] = config.UseADXFilterS;
        tv["ADX Periode"]        = config.ADXPeriod;
        tv["ADX Minimum"]        = config.ADXMin;

        // ATR
        tv["ATR-Filter Long"]  = config.UseATRFilterL;
        tv["ATR-Filter Short"] = config.UseATRFilterS;
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
                        alert(`⚠ Versionskonflikt!\n\nDu verwendest Strategie-Familie v${tvVer}, aber die Datei stammt von Oldman Trader v${botVer}.\n\nErlaubte Kombinationen:\n• Strategie v3.1  →  Oldman Trader v3.14\n• Strategie v4.x/v5.x (Oldman Strategie TiL)  →  Oldman Trader v4.x/v5.x\n\nBitte passende Datei laden.`);
                        resolve(0);
                        return;
                    }

                    const tvSettings = mapConfigToTv(cbotset.Parameters, tvVer);

                    // Sicherung aller TradingView-Felder (seit 4.1): zuerst die Sicherung,
                    // dann die Werte aus den cTrader-Parametern drüber – die haben Vorrang
                    // (z. B. nach dem Optimierer oder einer Änderung in cTrader).
                    const snap = cbotset.TradingView && cbotset.TradingView.Felder;
                    const merged = {};
                    if (snap && typeof snap === "object") {
                        log(`TradingView-Sicherung gefunden: ${Object.keys(snap).length} Felder (Strategie ${cbotset.TradingView.Strategie || "?"}, gesichert ${cbotset.TradingView.Gesichert || "?"})`);
                        for (const [key, value] of Object.entries(snap)) {
                            if (key === "Skript-Version") continue;
                            if (NEVER_TRANSFER.includes(key.replace(/ #\d+$/, ""))) continue;
                            merged[normKey(key)] = value;
                        }
                    }
                    Object.assign(merged, tvSettings);
                    // 4.x-Skripte haben keine 5.x-Felder (Dominant Engulfing, ADX, ATR) – weder setzen noch als Fehler melden
                    if (String(currentTv["Skript-Version"] || "").startsWith("v4")) {
                        for (const key of Object.keys(merged)) {
                            if (EXPORT_ONLY_V5.includes(key.replace(/ #\d+$/, ""))) delete merged[key];
                        }
                    }

                    let imported = 0;
                    let failed = [];
                    const written = [];

                    const checkboxEntries = [];
                    const inputEntries = [];
                    const comboEntries = [];

                    log("Searching for controls in modal...");
                    for (const [key, value] of Object.entries(merged)) {
                        const m = key.match(/^(.*) #(\d+)$/);
                        const fieldLabel = m ? m[1] : key;
                        const nth = m ? parseInt(m[2], 10) : 1;
                        const label = key;
                        const control = findControlByLabel(modal, fieldLabel, nth);

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

                    const notFound = failed.length;
                    const failedText = notFound
                        ? `\n\n⚠ ${notFound} Werte nicht übertragen (Feld fehlt in diesem Skript oder ließ sich nicht setzen):\n` +
                          formatIssueList(failed.map(f => `${f.Feld} = ${f.Wert} (${f.Status.includes("GEFUNDEN") ? "Feld nicht gefunden" : "nicht übernommen"})`))
                        : "";
                    if (snap && typeof snap === "object") {
                        alert(`✓ cTrader Import erfolgreich!\n\n${imported} Settings wurden übertragen – inklusive der TradingView-Sicherung aus der Datei (z. B. Backtest-Zeitraum, Anzeige).\nWerte aus cTrader haben Vorrang vor der Sicherung.` +
                            failedText +
                            `\n\n⚠ Bitte manuell in TradingView setzen:\n- Wochenende Schließzeit (Kerze)\n- Abend Schließzeit (Kerze)\n- US-Halbtage Schließzeit (Kerze)\n→ Kerzenzeit des jeweiligen Timeframes!`);
                    } else {
                        alert(`✓ cTrader Import erfolgreich!\n\n${imported} Settings wurden übertragen.\n(Datei ohne TradingView-Sicherung – mit älterem Userscript erstellt.)${failedText}\n\n⚠ Bitte manuell in TradingView setzen:\n- Wochenende Schließzeit (Kerze)\n- Abend Schließzeit (Kerze)\n- US-Halbtage Schließzeit (Kerze)\n→ Kerzenzeit des jeweiligen Timeframes!`);
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
        container.style.cssText = "display:inline-flex;gap:6px;margin-left:8px;";

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
            alert(`✓ Einstellungen kopiert!\n\nBitte öffne jetzt den Indikator "Oldman Alarm TiL"\nund klicke auf "Strategie einfügen".`);
            setTimeout(() => { copyBtn.textContent = "Alarm"; copyBtn.style.background = "#2E7D32"; }, 2000);
        });

        exportBtn.addEventListener("click", async () => { await exportCTraderConfig(modal); });

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
        // ^= „beginnt mit“: Skriptname darf die Version tragen, z. B. „Oldman Strategie TiL 5.1“ (seit 25.10.2026)
        const strategyModal = document.querySelector('div[data-dialog-name^="Oldman Strategie TiL"], div[data-dialog-name^="Engulfing Setup Strategy"]');
        if (strategyModal) addButtonsToStrategy(strategyModal);
        const alarmModal = document.querySelector('div[data-dialog-name^="Oldman Alarm TiL"], div[data-dialog-name^="Engulfing Setup Alerts"]');
        if (alarmModal) addImportButtonToAlarm(alarmModal);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    log('Oldman Universal Script v1.5 ready');

})();