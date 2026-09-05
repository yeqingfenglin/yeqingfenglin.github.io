(function () {
  'use strict';

  const profileId = document.body.dataset.profileId;
  const config = window.SITE_SUPABASE_CONFIG || {};
  const contentConfig = window.SITE_CONTENT_CONFIG || { gatewayFunction: 'cos-content' };
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
    return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(color) ? color : '';
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
    if (/^(xx-small|x-small|small|medium|large|x-large|xx-large|[1-7](?:\.\d+)?(?:px|rem|em|%))$/i.test(fontSize)) declarations.push(`font-size: ${fontSize}`);
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
          for (const attribute of Array.from(child.attributes)) child.removeAttribute(attribute.name);
          if (child.tagName === 'LI' && originalClass.split(/\s+/).includes('academic-item')) child.className = 'academic-item';
          if (child.tagName === 'UL' && originalClass.split(/\s+/).includes('academic-list')) child.className = 'academic-list';
          if (child.tagName === 'TABLE') child.className = 'experience-table';
          if (child.tagName === 'SPAN' && originalClass.split(/\s+/).includes('academic-year')) {
            child.className = 'academic-year';
            if (/^(Paper|Year)$/i.test(child.textContent.trim())) child.textContent = '';
          }
          const safeStyle = safeInlineStyle(originalStyle);
          if (safeStyle) child.setAttribute('style', safeStyle);
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

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element && typeof value === 'string' && value.trim()) element.textContent = value;
  }

  function renderRichList(id, html) {
    const element = document.getElementById(id);
    if (element && typeof html === 'string') element.innerHTML = sanitizeHtml(/^\s*<li\b/i.test(html) ? `<ul class="academic-list">${html}</ul>` : html);
  }

  function renderProfile(profile) {
    profile = { ...profile };
    for (const field of ['title', 'location', 'email', 'linksHtml']) {
      const probe = document.createElement('div');
      probe.innerHTML = sanitizeHtml(profile[field]);
      const text = probe.textContent.replace(/\u00a0/g, ' ').trim();
      if (!text || /^(?:(?:Location|Email|Academic links|Academic title and affiliation)\s+)?to be added$/i.test(text)) profile[field] = 'to be added';
    }
    setText('profile-name', profile.displayName);
    document.querySelectorAll('[data-profile-name]').forEach(element => {
      if (profile.displayName) element.textContent = profile.displayName;
    });
    const portrait = document.querySelector('.portrait-placeholder');
    if (portrait) {
      const initials = profile.initials || String(profile.displayName || '').split(/\s+/).map(part => part[0] || '').join('').slice(0, 2).toUpperCase();
      const avatarUrl = safeImageUrl(profile.avatar?.url);
      portrait.innerHTML = '';
      portrait.setAttribute('aria-label', avatarUrl ? `Portrait of ${profile.displayName || 'profile owner'}` : `${profile.displayName || 'Profile owner'} initials`);
      const fallback = document.createElement('span');
      fallback.textContent = initials;
      portrait.appendChild(fallback);
      if (avatarUrl) {
        fallback.hidden = true;
        const image = document.createElement('img');
        image.src = avatarUrl;
        image.alt = `Portrait of ${profile.displayName || 'profile owner'}`;
        image.decoding = 'async';
        image.addEventListener('error', () => {
          image.remove();
          fallback.hidden = false;
          portrait.setAttribute('aria-label', `${profile.displayName || 'Profile owner'} initials`);
        }, { once: true });
        portrait.appendChild(image);
      }
    }
    setText('profile-title', profile.title);
    setText('profile-about-heading', profile.aboutHeading);
    setText('profile-research-heading', profile.researchHeading);
    setText('profile-publications-heading', profile.publicationsHeading);
    setText('profile-education-heading', profile.educationHeading);
    setText('profile-teaching-heading', profile.teachingHeading || 'Teaching');
    setText('profile-documents-heading', profile.documentsHeading);
    setText('profile-location', profile.location);
    const email = document.getElementById('profile-email');
    if (email && profile.email) {
      email.innerHTML = '';
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
        const link = document.createElement('a');
        link.href = `mailto:${profile.email}`;
        link.textContent = profile.email;
        email.appendChild(link);
      } else email.textContent = profile.email;
    }
    const links = document.getElementById('profile-links');
    if (links && profile.linksHtml) links.innerHTML = sanitizeHtml(profile.linksHtml);
    renderRichList('profile-about', profile.aboutHtml);
    renderRichList('profile-research', profile.researchHtml);
    renderRichList('profile-publications', profile.publicationsHtml);
    renderRichList('profile-education', profile.educationHtml);
    renderRichList('profile-teaching', profile.teachingHtml ?? '<p>to be added</p>');
    if (profile.updatedAt) {
      const updated = new Date(profile.updatedAt);
      if (!Number.isNaN(updated.getTime())) setText('profile-updated', `Last updated: ${updated.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    }
    // Files are managed in the editor and linked explicitly from profile text.
    const section = document.querySelector('.profile-files-section');
    if (section) section.hidden = true;
  }

  async function loadProfile() {
    if (!profileId || !window.supabase?.createClient || !config.url || !config.publishableKey) return;
    try {
      const client = window.supabase.createClient(String(config.url).replace(/\/$/, ''), config.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await client.functions.invoke(contentConfig.gatewayFunction || 'cos-content', { body: { action: 'get-public-profile', profileId } });
      if (error) throw error;
      if (data?.profile) renderProfile(data.profile);
    } catch (error) {
      console.warn('The saved public profile could not be loaded; the page fallback remains visible.', error);
    }
  }

  loadProfile();
})();

