/* ============================================================
 *  Content Formatters — markdown-to-HTML and HTML escaping
 * ============================================================ */
(function () {
  'use strict';

  function escapeHTML(str) {
    if (!str) return '';
    var el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }

  // ── Helpers ──────────────────────────────────────────────────

  /** Detect if a group of lines forms a markdown table. */
  function isTableBlock(lines) {
    if (lines.length < 2) return false;
    // Row 0 must have at least one pipe and row 1 must be a separator (pipes + dashes/colons)
    return /\|/.test(lines[0]) && /^\s*\|?[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)*\|?\s*$/.test(lines[1]);
  }

  function parseCells(row) {
    // Strip leading/trailing pipe then split on pipes
    var trimmed = row.replace(/^\s*\|/, '').replace(/\|\s*$/, '');
    return trimmed.split('|').map(function (c) { return c.trim(); });
  }

  function parseAlignment(sepRow) {
    return parseCells(sepRow).map(function (c) {
      var left  = c.charAt(0) === ':';
      var right = c.charAt(c.length - 1) === ':';
      if (left && right) return 'center';
      if (right) return 'right';
      return 'left';
    });
  }

  function renderTable(lines) {
    var headers = parseCells(lines[0]);
    var aligns  = parseAlignment(lines[1]);
    var html = '<table class="md-table"><thead><tr>';
    headers.forEach(function (h, i) {
      var a = aligns[i] || 'left';
      html += '<th style="text-align:' + a + '">' + inlineFormat(escapeHTML(h)) + '</th>';
    });
    html += '</tr></thead><tbody>';
    for (var r = 2; r < lines.length; r++) {
      if (!lines[r].trim()) break;
      var cells = parseCells(lines[r]);
      html += '<tr>';
      cells.forEach(function (c, i) {
        var a = aligns[i] || 'left';
        html += '<td style="text-align:' + a + '">' + inlineFormat(escapeHTML(c)) + '</td>';
      });
      html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
  }

  /** Apply inline-only markdown formatting to an already-escaped string. */
  function inlineFormat(html) {
    // Bold + italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Strikethrough
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Links  [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return html;
  }

  // ── Main formatter ───────────────────────────────────────────

  /** Simple LRU-ish cache to avoid re-parsing identical content. */
  var _cache = new Map();
  var _cacheMax = 120;

  function formatMarkdownContent(text) {
    if (!text) return '';

    var cached = _cache.get(text);
    if (cached !== undefined) return cached;

    var result = _parseMarkdown(text);

    if (_cache.size >= _cacheMax) {
      // evict oldest entry
      _cache.delete(_cache.keys().next().value);
    }
    _cache.set(text, result);
    return result;
  }

  function _parseMarkdown(text) {
    var lines   = text.split('\n');
    var len     = lines.length;
    var out     = [];
    var i       = 0;
    var inList  = false;
    var listTag = '';

    function closeList() {
      if (inList) { out.push('</' + listTag + '>'); inList = false; }
    }

    /** Check table at position without allocating a slice. */
    function tableAt(pos) {
      if (pos + 1 >= len) return false;
      return /\|/.test(lines[pos]) && /^\s*\|?[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)*\|?\s*$/.test(lines[pos + 1]);
    }

    while (i < len) {
      var line = lines[i];

      // ── Fenced code blocks ───────────────────────────────────
      var fenceMatch = line.match(/^(`{3,})(\w*)\s*$/);
      if (fenceMatch) {
        closeList();
        var fence = fenceMatch[1];
        var lang  = fenceMatch[2] || '';
        var closeRe = new RegExp('^' + fence + '\\s*$');
        var codeLines = [];
        i++;
        while (i < len && !closeRe.test(lines[i])) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < len) i++; // skip closing fence
        out.push('<pre' + (lang ? ' data-lang="' + escapeHTML(lang) + '"' : '') + '><code>'
          + escapeHTML(codeLines.join('\n'))
          + '</code></pre>');
        continue;
      }

      // ── Tables ───────────────────────────────────────────────
      if (tableAt(i)) {
        closeList();
        var tableLines = [];
        while (i < len && lines[i].trim() !== '' && /\|/.test(lines[i])) {
          tableLines.push(lines[i]);
          i++;
        }
        out.push(renderTable(tableLines));
        continue;
      }

      // ── Horizontal rule ──────────────────────────────────────
      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
        closeList();
        out.push('<hr>');
        i++;
        continue;
      }

      // ── Headers ──────────────────────────────────────────────
      var headMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headMatch) {
        closeList();
        var level = headMatch[1].length;
        out.push('<h' + level + '>' + inlineFormat(escapeHTML(headMatch[2])) + '</h' + level + '>');
        i++;
        continue;
      }

      // ── Unordered list ───────────────────────────────────────
      var ulMatch = line.match(/^(\s*)[-*+]\s+(.*)/);
      if (ulMatch) {
        if (!inList || listTag !== 'ul') { closeList(); out.push('<ul>'); inList = true; listTag = 'ul'; }
        out.push('<li>' + inlineFormat(escapeHTML(ulMatch[2])) + '</li>');
        i++;
        continue;
      }

      // ── Ordered list ─────────────────────────────────────────
      var olMatch = line.match(/^(\s*)\d+[.)]\s+(.*)/);
      if (olMatch) {
        if (!inList || listTag !== 'ol') { closeList(); out.push('<ol>'); inList = true; listTag = 'ol'; }
        out.push('<li>' + inlineFormat(escapeHTML(olMatch[2])) + '</li>');
        i++;
        continue;
      }

      // ── Blockquote ───────────────────────────────────────────
      if (/^>\s?/.test(line)) {
        closeList();
        var bqLines = [];
        while (i < len && /^>\s?/.test(lines[i])) {
          bqLines.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        out.push('<blockquote>' + inlineFormat(escapeHTML(bqLines.join('\n'))) + '</blockquote>');
        continue;
      }

      // ── Blank line ───────────────────────────────────────────
      if (line.trim() === '') {
        closeList();
        i++;
        continue;
      }

      // ── Paragraph ────────────────────────────────────────────
      closeList();
      var paraLines = [];
      while (i < len && lines[i].trim() !== ''
        && !/^(#{1,6}\s|>\s?|`{3,})/.test(lines[i])
        && !/^\s*([-*_])\1{2,}\s*$/.test(lines[i])
        && !/^\s*[-*+]\s/.test(lines[i])
        && !/^\s*\d+[.)]\s/.test(lines[i])
        && !tableAt(i)) {
        paraLines.push(lines[i]);
        i++;
      }
      if (paraLines.length === 0) {
        // Safety: line didn't match any block pattern — emit as-is and advance
        out.push('<p>' + inlineFormat(escapeHTML(lines[i] || '')) + '</p>');
        i++;
      } else {
        out.push('<p>' + inlineFormat(escapeHTML(paraLines.join('\n'))) + '</p>');
      }
    }

    closeList();
    return out.join('\n');
  }

  window.ContentFormatters = {
    escapeHTML: escapeHTML,
    inlineFormat: inlineFormat,
    formatMarkdownContent: formatMarkdownContent
  };
})();
