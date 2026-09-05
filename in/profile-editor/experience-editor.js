(function () {
  'use strict';
  const fields = ['educationHtml', 'teachingHtml'];
  const activeRows = new Map();
  const notify = () => document.getElementById('editor-main').dispatchEvent(new Event('input', { bubbles: true }));

  function prepare(field) {
    const host = document.querySelector(`[data-field="${field}"]`);
    host.innerHTML = window.ProfileContent.experienceTable(host.innerHTML);
    host.removeAttribute('contenteditable');
    const table = host.querySelector('table');
    for (const row of table.rows) {
      [...row.cells].forEach((cell, index) => {
        cell.setAttribute('contenteditable', 'true');
        cell.spellcheck = true;
        cell.setAttribute('role', 'textbox');
        cell.setAttribute('aria-label', `${field === 'educationHtml' ? 'Education' : 'Teaching'} ${index === 0 ? '时间' : '经历内容'}`);
        cell.addEventListener('focus', () => activeRows.set(field, row));
        cell.addEventListener('input', notify);
      });
    }
    activeRows.delete(field);
    const handle = host.parentElement.querySelector('.column-resizer');
    const setWidth = value => {
      const width = window.ProfileContent.columnWidth(Math.min(55, Math.max(12, value)));
      table.dataset.timeWidth = String(width);
      table.style.setProperty('--time-column-width', `${width}%`);
      handle.style.left = `${width}%`;
      handle.setAttribute('aria-valuenow', String(width));
      handle.setAttribute('aria-valuetext', `时间列 ${width}%，内容列 ${Math.round((100 - width) * 10) / 10}%`);
    };
    setWidth(Number(table.dataset.timeWidth));
    // Remove handlers from the previous render before binding the new table.
    handle.editorEvents?.abort();
    handle.editorEvents = new AbortController();
    const listen = (name, callback) => handle.addEventListener(name, callback, { signal: handle.editorEvents.signal });
    let pointer = null;
    listen('pointerdown', event => {
      event.preventDefault();
      pointer = event.pointerId;
      handle.setPointerCapture(pointer);
      handle.classList.add('dragging');
    });
    listen('pointermove', event => {
      if (event.pointerId !== pointer) return;
      const rect = table.getBoundingClientRect();
      if (rect.width) setWidth((event.clientX - rect.left) / rect.width * 100);
    });
    const finish = () => {
      if (pointer === null) return;
      pointer = null;
      handle.classList.remove('dragging');
      notify();
    };
    listen('pointerup', finish);
    listen('pointercancel', finish);
    listen('lostpointercapture', finish);
    listen('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const current = Number(table.dataset.timeWidth);
      setWidth(event.key === 'Home' ? 12 : event.key === 'End' ? 55 : current + (event.key === 'ArrowLeft' ? -1 : 1));
      notify();
    });
  }

  function changeRow(field, action) {
    const host = document.querySelector(`[data-field="${field}"]`);
    const table = host.querySelector('table');
    const active = activeRows.get(field);
    let index = active?.isConnected ? active.rowIndex : table.rows.length - 1;
    if (action === 'add') {
      const row = table.insertRow(index + 1);
      row.insertCell().innerHTML = '<br>';
      row.insertCell().innerHTML = '<br>';
      index += 1;
    } else {
      if (!active?.isConnected) return alert('请先点击要删除的经历所在行。');
      if (active.textContent.trim() && !confirm('删除这一行经历及其中的内容？')) return;
      active.remove();
      index = Math.max(0, index - 1);
    }
    prepare(field);
    const cell = host.querySelector('table').rows[Math.min(index, host.querySelector('table').rows.length - 1)].cells[0];
    cell.focus();
    notify();
  }

  document.querySelectorAll('[data-experience-action]').forEach(button => {
    button.addEventListener('click', () => changeRow(button.dataset.experienceField, button.dataset.experienceAction));
  });
  window.ExperienceEditor = { prepareAll: () => fields.forEach(prepare) };
})();
