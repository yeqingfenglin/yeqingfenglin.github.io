(function () {
  'use strict';
  const allowedTags = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'A', 'UL', 'OL', 'LI', 'H3', 'SPAN', 'DIV', 'FONT', 'TABLE', 'TBODY', 'THEAD', 'TFOOT', 'TR', 'TD', 'TH']);

  function safeUrl(value) {
    const url = String(value || '').trim();
    return /^(https?:\/\/|mailto:)/i.test(url) ? url : '';
  }

  function safeImageUrl(value) {
    const url = String(value || '').trim();
    return /^https:\/\//i.test(url) ? url : '';
  }

  function safeCssColor(value) {
    const color = String(value || '').trim();
    return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|transparent|inherit)$/i.test(color) ? color : '';
  }

  function safeInlineStyle(value) {
    const source = document.createElement('span');
    source.style.cssText = String(value || '');
    const declarations = [];
    const color = safeCssColor(source.style.color);
    const backgroundColor = safeCssColor(source.style.backgroundColor);
    const fontSize = String(source.style.fontSize || '').trim();
    if (color) declarations.push(`color: ${color}`);
    if (backgroundColor) declarations.push(`background-color: ${backgroundColor}`);
    if (/^(xx-small|x-small|small|medium|large|x-large|xx-large|inherit|\d{1,3}(?:\.\d+)?(?:px|rem|em|%))$/i.test(fontSize)) declarations.push(`font-size: ${fontSize}`);
    return declarations.join('; ');
  }

  function sanitizeHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    const clean = node => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          if (!allowedTags.has(child.tagName)) {
            clean(child);
            child.replaceWith(...Array.from(child.childNodes));
            continue;
          }
          const originalHref = child.tagName === 'A' ? child.getAttribute('href') : '';
          const originalClass = child.getAttribute('class') || '';
          const originalStyle = child.getAttribute('style') || '';
          const originalColor = child.tagName === 'FONT' ? child.getAttribute('color') : '';
          const originalSize = child.tagName === 'FONT' ? child.getAttribute('size') : '';
          const timeWidth = child.getAttribute('data-time-width');
          for (const attribute of Array.from(child.attributes)) child.removeAttribute(attribute.name);
          if (child.tagName === 'LI' && originalClass.split(/\s+/).includes('academic-item')) child.className = 'academic-item';
          if (child.tagName === 'UL' && originalClass.split(/\s+/).includes('academic-list')) child.className = 'academic-list';
          if (child.tagName === 'TABLE') {
            child.className = 'experience-table';
            const width = columnWidth(timeWidth);
            child.setAttribute('data-time-width', String(width));
            child.style.setProperty('--time-column-width', `${width}%`);
          }
          if (child.tagName === 'SPAN' && originalClass.split(/\s+/).includes('academic-year')) {
            child.className = 'academic-year';
            if (/^(Paper|Year)$/i.test(child.textContent.trim())) child.textContent = '';
          }
          const safeStyle = safeInlineStyle(originalStyle);
          if (safeStyle) child.style.cssText = [child.style.cssText, safeStyle].filter(Boolean).join(' ');
          if (child.tagName === 'FONT') {
            const color = safeCssColor(originalColor);
            if (color) child.setAttribute('color', color);
            if (/^[1-7]$/.test(String(originalSize || ''))) child.setAttribute('size', originalSize);
          }
          if (child.tagName === 'A') {
            const href = safeUrl(originalHref);
            if (href) {
              child.setAttribute('href', href);
              child.setAttribute('target', '_blank');
              child.setAttribute('rel', 'noopener noreferrer');
            } else child.replaceWith(...Array.from(child.childNodes));
          }
          clean(child);
        } else if (child.nodeType !== Node.TEXT_NODE) child.remove();
      }
    };
    clean(template.content);
    return template.innerHTML;
  }


  function columnWidth(value) {
    const width = Number(value);
    return Number.isFinite(width) && width >= 12 && width <= 55 ? Math.round(width * 10) / 10 : 22;
  }

  function cleanLegacy(html) {
    const template = document.createElement('template');
    template.innerHTML = sanitizeHtml(html);
    const defaults = new Set([
      'Publication title to be added Authors, journal or conference, year, abstract, PDF, and related links.',
      'Institution to be added Degree, field of study, or academic position.'
    ]);
    const plain = node => node.textContent.replace(/\s+/g, ' ').trim();
    template.content.querySelectorAll('.academic-item').forEach(item => {
      // Remove only the complete, unchanged demo entry; preserve actual user content.
      const copy = item.cloneNode(true);
      copy.querySelectorAll('.academic-year').forEach(year => {
        if (!year.textContent.trim() || /^(Paper|Year)$/i.test(year.textContent.trim())) year.remove();
      });
      const words = [...copy.querySelectorAll('h3,p')].map(plain).join(' ');
      if (defaults.has(words) && plain(copy).replace(/\s/g, '') === words.replace(/\s/g, '')) item.remove();
    });
    template.content.querySelectorAll('ul,ol').forEach(list => { if (!list.textContent.trim() && !list.querySelector('table')) list.remove(); });
    return template.innerHTML;
  }

  function experienceTable(html) {
    const holder = document.createElement('div');
    holder.innerHTML = cleanLegacy(html);
    const oldTable = holder.querySelector('table');
    const table = document.createElement('table');
    table.className = 'experience-table';
    const width = columnWidth(oldTable?.getAttribute('data-time-width'));
    table.setAttribute('data-time-width', String(width));
    table.style.setProperty('--time-column-width', `${width}%`);
    const body = table.createTBody();
    const add = (time, content) => {
      const row = body.insertRow();
      row.insertCell().innerHTML = time || '<br>';
      row.insertCell().innerHTML = content || '<br>';
    };
    for (const node of [...holder.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) continue;
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'TABLE') {
        for (const row of node.rows) add(row.cells[0]?.innerHTML, [...row.cells].slice(1).map(cell => cell.innerHTML).join('<br>'));
      } else if (node.nodeType === Node.ELEMENT_NODE && (node.matches('ul,ol') || node.matches('li'))) {
        const items = node.matches('li') ? [node] : [...node.children];
        for (const item of items) {
          const year = item.querySelector('.academic-year');
          const time = year?.innerHTML || '';
          year?.remove();
          add(time, item.innerHTML);
        }
      } else {
        const cell = document.createElement('div');
        cell.appendChild(node.cloneNode(true));
        add('', cell.innerHTML);
      }
    }
    if (!body.rows.length) add('', '');
    return table.outerHTML;
  }

  window.ProfileContent = { safeUrl, safeImageUrl, sanitizeHtml, columnWidth, cleanLegacy, experienceTable };
})();
