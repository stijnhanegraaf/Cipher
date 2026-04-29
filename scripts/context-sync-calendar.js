#!/usr/bin/env node
/**
 * context-sync-calendar.js
 * Fetches calendar events via CalDAV, expands RRULEs into individual occurrences,
 * and writes them into CONTEXT.json with provenance tags. Also prints a human-readable summary.
 *
 * Called by the daily calendar cron after the normal calendar check.
 *
 * Provenance: Every event carries source: caldav, trust: untrusted, provenance: <ical UID>.
 * This prevents poisoned calendar content from being treated as agent instructions.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { RRule, RRuleSet } = require('rrule');

const CONTEXT_FILE = path.join(__dirname, '../CONTEXT.json');
const CALDAV_SERVER = 'p149-caldav.icloud.com';
const envText = fs.readFileSync('/root/.openclaw/secrets/icloud-calendar.env', 'utf8');
const envMap = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter(line => line.trim() && !line.trim().startsWith('#') && line.includes('='))
    .map(line => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    })
);
const CALDAV_USERNAME = envMap.APPLE_ID || envMap.CALDAV_USERNAME || 'hi@stijnhanegraaf.com';
const CALDAV_PASSWORD = envMap.APPLE_APP_PASSWORD || envMap.CALDAV_PASSWORD;

const CALENDARS = [
  { name: 'Home', path: envMap.CALDAV_HOME_PATH || '/1243847498/calendars/0CD0432D-7D3C-4F67-940C-DC1E8BD6C485/' },
  { name: 'Prive', path: envMap.CALDAV_PRIVATE_PATH || envMap.CALDAV_PRIVE_PATH || '/1243847498/calendars/4AF23AF2-14E7-435E-87E6-9F356CEAD4FF/' }
];

// Vault paths for daily notes
const VAULT_ROOT = path.join(__dirname, '../Obsidian/wiki');
const JOURNAL_DIR = path.join(VAULT_ROOT, 'journal');

// Section markers for merge-driver compatibility
const CALDAV_START_MARKER = '<!-- caldav:start -->';
const CALDAV_END_MARKER = '<!-- caldav:end -->';

function loadContext() {
  try { return JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf8')); } catch { return {}; }
}

function saveContext(ctx) {
  ctx._updated = new Date().toISOString();
  ctx._version = (ctx._version || 0) + 1;
  fs.writeFileSync(CONTEXT_FILE, JSON.stringify(ctx, null, 2));
}

function todayAMS() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
}

function parseICSDate(str) {
  if (!str) return null;
  const isUTC = str.endsWith('Z');
  const s = str.replace('Z', '').replace(/T/, ' ');
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(?: (\d{2})(\d{2})(\d{2}))?/);
  if (!m) return null;
  const [,y,mo,d,h='00',mi='00'] = m;

  if (isUTC) {
    return new Date(`${y}-${mo}-${d}T${h}:${mi}:00Z`);
  }

  // Floating time — treat as Amsterdam local (CET/CEST), handles DST correctly
  const utcGuess = new Date(`${y}-${mo}-${d}T${h}:${mi}:00Z`);
  const localH = parseInt(utcGuess.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam', hour: '2-digit', hour12: false }));
  const localM = parseInt(utcGuess.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam', minute: '2-digit', hour12: false }));
  const diffMs = ((parseInt(h) - localH) * 60 + (parseInt(mi) - localM)) * 60000;
  return new Date(utcGuess.getTime() + diffMs);
}

function formatTimeCET(date) {
  if (!date) return 'all-day';
  return date.toLocaleTimeString('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDateCET(date) {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
}

function getLineValue(block, key) {
  const lines = block.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(new RegExp(`^${key}(?:;[^:]*)?:\\s*(.+)`));
    if (m) return m[1].trim();
  }
  return null;
}

function getMultiLineValue(block, key) {
  const lines = block.split(/\r?\n/);
  let found = false;
  let value = '';
  for (const line of lines) {
    if (!found) {
      const m = line.match(new RegExp(`^${key}(?:;[^:]*)?:\\s*(.+)`));
      if (m) { found = true; value = m[1]; }
    } else if (line.startsWith(' ') || line.startsWith('\t')) {
      value += line.slice(1);
    } else {
      break;
    }
  }
  return value || null;
}

function getDurationMinutes(str) {
  if (!str) return null;
  const m = str.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return null;
  return ((parseInt(m[1] || 0, 10) * 60) + parseInt(m[2] || 0, 10));
}

function parseRRULE(rruleStr, dtstart) {
  if (!rruleStr) return null;
  const options = { dtstart };
  const pairs = rruleStr.split(';');
  for (const pair of pairs) {
    const [k, v] = pair.split('=');
    if (!k || !v) continue;
    switch (k) {
      case 'FREQ': options.freq = RRule[v]; break;
      case 'UNTIL': options.until = parseICSDate(v); break;
      case 'COUNT': options.count = parseInt(v, 10); break;
      case 'INTERVAL': options.interval = parseInt(v, 10); break;
      case 'BYDAY':
        options.byweekday = v.split(',').map(d => {
          const m = d.match(/^([+-]?\d)?([A-Z]{2})$/);
          if (!m) return null;
          const n = m[1] ? parseInt(m[1], 10) : undefined;
          const wd = RRule[d.substring(m[1] ? m[1].length : 0)];
          return n !== undefined ? wd.nth(n) : wd;
        }).filter(Boolean);
        break;
      case 'BYMONTHDAY': options.bymonthday = v.split(',').map(n => parseInt(n, 10)); break;
      case 'BYMONTH': options.bymonth = v.split(',').map(n => parseInt(n, 10)); break;
      case 'BYSETPOS': options.bysetpos = v.split(',').map(n => parseInt(n, 10)); break;
    }
  }
  try { return new RRule(options); } catch { return null; }
}

function isAllDayEvent(block, dtstart) {
  const lines = block.split(/\r?\n/);
  for (const line of lines) {
    if (line.match(/^DTSTART;VALUE=DATE:/)) return true;
    if (line.match(/^DTSTART:\d{8}$/) && !dtstart) return true;
  }
  return false;
}

function parseCalendarData(data, calName) {
  const events = [];
  const veventBlocks = data.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  for (const block of veventBlocks) {
    const uid = getLineValue(block, 'UID') || '';
    const summary = getLineValue(block, 'SUMMARY') || '';
    const dtstart = getLineValue(block, 'DTSTART');
    const dtend = getLineValue(block, 'DTEND');
    const duration = getLineValue(block, 'DURATION');
    const rruleStr = getLineValue(block, 'RRULE');
    const exdateStrs = (block.match(/EXDATE[^:]*:[^\r\n]+/g) || [])
      .map(l => l.split(':')[1].trim());
    const recurrenceId = getLineValue(block, 'RECURRENCE-ID');
    const status = getLineValue(block, 'STATUS') || 'CONFIRMED';

    if (!summary) continue;

    const isAllDay = isAllDayEvent(block, dtstart);
    const startDate = parseICSDate(dtstart);
    const endDate = parseICSDate(dtend);
    const durMinutes = getDurationMinutes(duration) || (startDate && endDate ? (endDate - startDate) / 60000 : null);

    const baseEvent = {
      uid: uid.split('@')[0] || uid,
      summary,
      calendar: calName,
      isAllDay,
      durationMinutes: durMinutes,
      startDate,
      endDate,
      rrule: rruleStr,
      exdates: exdateStrs.map(parseICSDate).filter(Boolean),
      recurrenceId,
      status
    };

    events.push(baseEvent);
  }
  return events;
}

function expandEvent(event, rangeStart, rangeEnd) {
  const occurrences = [];

  // All-day floating dates: treat as Amsterdam local midnight UTC to avoid DST shifts
  const effectiveStart = (event.isAllDay && event.startDate)
    ? new Date(`${event.startDate.toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' })}T00:00:00Z`)
    : event.startDate;

  if (!event.rrule) {
    if (effectiveStart && effectiveStart >= rangeStart && effectiveStart <= rangeEnd) {
      occurrences.push(buildOccurrence(event, effectiveStart));
    }
    return occurrences;
  }

  const rule = parseRRULE(event.rrule, effectiveStart);
  if (!rule) {
    if (effectiveStart && effectiveStart >= rangeStart && effectiveStart <= rangeEnd) {
      occurrences.push(buildOccurrence(event, effectiveStart));
    }
    return occurrences;
  }

  const dates = rule.between(rangeStart, rangeEnd, true);

  for (const d of dates) {
    // Skip if this occurrence matches an EXDATE (compare day-level for all-day, exact otherwise)
    const skip = event.exdates.some(ex => {
      if (event.isAllDay) {
        return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' }) ===
               ex.toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
      }
      return d.getTime() === ex.getTime();
    });
    if (skip) continue;

    occurrences.push(buildOccurrence(event, d));
  }

  return occurrences;
}

function buildOccurrence(event, startDate) {
  const endDate = event.durationMinutes
    ? new Date(startDate.getTime() + event.durationMinutes * 60000)
    : startDate;

  return {
    summary: event.summary,
    startDate,
    endDate,
    calendar: event.calendar,
    isAllDay: event.isAllDay,
    master_uid: event.uid,
    recurrence_id: startDate.toISOString(),
    status: event.status
  };
}

function pruneOldOccurrences(events) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  cutoff.setHours(0, 0, 0, 0);
  return events.filter(e => e.startDate && e.startDate >= cutoff);
}

async function fetchCalendar(cal, rangeStart, rangeEnd) {
  const fmt = d => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const timeMin = fmt(rangeStart);
  const timeMax = fmt(rangeEnd);

  const query = `<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:getetag/><C:calendar-data/></D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${timeMin}" end="${timeMax}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

  const auth = Buffer.from(`${CALDAV_USERNAME}:${CALDAV_PASSWORD}`).toString('base64');
  return new Promise((resolve) => {
    const req = https.request({
      hostname: CALDAV_SERVER,
      path: cal.path,
      method: 'REPORT',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/xml',
        'Depth': '1'
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 207) {
          resolve(parseCalendarData(data, cal.name));
        } else {
          resolve([]);
        }
      });
    });
    req.on('error', () => resolve([]));
    req.write(query);
    req.end();
  });
}

function formatEventEntry(event) {
  const timeStr = event.isAllDay ? 'all-day' : formatTimeCET(event.startDate);
  return [
    `---`,
    `source: caldav`,
    `trust: untrusted`,
    `provenance: ical://${event.master_uid}/${event.recurrence_id}`,
    `calendar: ${event.calendar}`,
    `time: ${timeStr}`,
    `---`,
    `- [ ] ${event.summary}`
  ].join('\n');
}

function buildCaldavSection(entries) {
  if (entries.length === 0) return '';
  return [
    '',
    CALDAV_START_MARKER,
    '### Calendar',
    '',
    ...entries.map(e => formatEventEntry(e)),
    '',
    CALDAV_END_MARKER,
  ].join('\n');
}

function stripExistingCaldavSection(content) {
  const startIdx = content.indexOf(CALDAV_START_MARKER);
  const endIdx = content.indexOf(CALDAV_END_MARKER);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + CALDAV_END_MARKER.length);
    // Clean up any double newlines left behind
    return (before + after).replace(/\n{3,}/g, '\n\n');
  }
  return content;
}

/**
 * Write an event occurrence into the vault as a daily note entry.
 * Uses provenance frontmatter to mark the event as untrusted.
 * Wraps calendar content in <!-- caldav:start/end --> markers for merge-driver compatibility.
 */
function writeEventToVault(event) {
  const dateStr = formatDateCET(event.startDate);
  const notePath = path.join(JOURNAL_DIR, `${dateStr}.md`);

  let existing = '';
  try { existing = fs.readFileSync(notePath, 'utf8'); } catch { /* file doesn't exist */ }

  if (existing) {
    // Strip any existing caldav section first, then rebuild with all events
    const cleanContent = stripExistingCaldavSection(existing);
    const newEntry = formatEventEntry(event);
    
    // Check if there's already a caldav section in the clean content (shouldn't be, but safety)
    const startIdx = cleanContent.indexOf(CALDAV_START_MARKER);
    const endIdx = cleanContent.indexOf(CALDAV_END_MARKER);

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      // Replace existing caldav section
      const before = cleanContent.slice(0, startIdx);
      const after = cleanContent.slice(endIdx + CALDAV_END_MARKER.length);
      const caldavContent = cleanContent.slice(startIdx + CALDAV_START_MARKER.length, endIdx).trim();
      const newCaldavSection = [
        '',
        CALDAV_START_MARKER,
        caldavContent,
        '',
        newEntry,
        '',
        CALDAV_END_MARKER,
      ].join('\n');
      fs.writeFileSync(notePath, (before + newCaldavSection + after).replace(/\n{3,}/g, '\n\n'));
    } else {
      // No existing caldav section — append after Work section or at end
      const entryLines = [
        '',
        CALDAV_START_MARKER,
        '### Calendar',
        '',
        newEntry,
        '',
        CALDAV_END_MARKER,
      ];
      const parts = cleanContent.split(/\n## /);
      if (parts.length > 1) {
        let found = false;
        const newParts = parts.map((part, idx) => {
          if (idx === 0) return part;
          if (part.startsWith('Work')) {
            found = true;
            return part + '\n' + entryLines.join('\n');
          }
          return '## ' + part;
        });
        if (found) {
          fs.writeFileSync(notePath, newParts.join('\n'));
        } else {
          fs.writeFileSync(notePath, cleanContent + '\n' + entryLines.join('\n'));
        }
      } else {
        fs.writeFileSync(notePath, cleanContent + '\n' + entryLines.join('\n'));
      }
    }
  } else {
    // Create new daily note with caldav section inside Work
    const caldavSection = buildCaldavSection([event]);
    const note = [
      `---`,
      `date: ${dateStr}`,
      `tags: [daily]`,
      `---`,
      ``,
      `# ${dateStr}`,
      ``,
      `## Summary`,
      ``,
      `## Highlights`,
      ``,
      `## Work`,
      caldavSection,
      ``,
      `## Life`,
      ``,
    ].join('\n');
    fs.mkdirSync(JOURNAL_DIR, { recursive: true });
    fs.writeFileSync(notePath, note);
  }

  return notePath;
}

async function main() {
  const now = new Date();
  const rangeStart = new Date(now);
  const rangeEnd = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const allEvents = [];
  for (const cal of CALENDARS) {
    const events = await fetchCalendar(cal, rangeStart, rangeEnd);
    allEvents.push(...events);
  }

  // Expand recurring events into occurrences
  let allOccurrences = [];
  for (const event of allEvents) {
    const expanded = expandEvent(event, rangeStart, rangeEnd);
    allOccurrences.push(...expanded);
  }

  // Prune occurrences older than 30 days
  allOccurrences = pruneOldOccurrences(allOccurrences);

  // Sort by start time
  allOccurrences.sort((a, b) => (a.startDate || 0) - (b.startDate || 0));

  // Format for CONTEXT.json with provenance
  const contextEvents = allOccurrences.map(e => ({
    time: e.isAllDay ? 'all-day' : formatTimeCET(e.startDate),
    what: e.summary,
    source: 'caldav',
    trust: 'untrusted',
    provenance: `ical://${e.master_uid}/${e.recurrence_id}`,
    calendar: e.calendar,
    master_uid: e.master_uid,
    recurrence_id: e.recurrence_id
  }));

  // Build a summary string (today only)
  const todayStr = todayAMS();
  const todayEvents = allOccurrences.filter(e => {
    if (!e.startDate) return true;
    const d = formatDateCET(e.startDate);
    return d === todayStr;
  });

  const summaryParts = todayEvents.map(e =>
    e.isAllDay ? e.summary : `${formatTimeCET(e.startDate)} ${e.summary}`
  );
  const summary = summaryParts.length
    ? summaryParts.join(', ')
    : 'Geen events vandaag';

  // Write to CONTEXT.json
  const ctx = loadContext();
  if (!ctx.today) ctx.today = {};
  ctx.today.date = todayStr;
  ctx.today.events = contextEvents;
  ctx.today.summary = summary;
  saveContext(ctx);

  // Write today's events to vault daily notes
  const vaultPaths = [];
  for (const e of todayEvents) {
    try {
      const p = writeEventToVault(e);
      vaultPaths.push(p);
    } catch (err) {
      console.error(`Failed to write event to vault: ${e.summary}`, err.message);
    }
  }

  // Human-readable output
  if (allOccurrences.length === 0) {
    console.log('📅 Geen events in de komende 90 dagen');
  } else {
    console.log(`📅 ${allOccurrences.length} event(s) — CONTEXT.json updated`);
    for (const e of allOccurrences.slice(0, 20)) {
      const dateStr = formatDateCET(e.startDate);
      const timeStr = e.isAllDay ? 'all-day' : formatTimeCET(e.startDate);
      console.log(`  • ${dateStr} ${timeStr} — ${e.summary} (${e.calendar})`);
    }
    if (allOccurrences.length > 20) {
      console.log(`  ... en ${allOccurrences.length - 20} meer`);
    }
  }
  if (vaultPaths.length > 0) {
    console.log(`📝 ${vaultPaths.length} event(s) written to vault daily notes`);
  }
}

main().catch(console.error);
