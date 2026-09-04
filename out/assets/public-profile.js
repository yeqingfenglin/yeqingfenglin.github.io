(function () {
  'use strict';

  const profileId = document.body.dataset.profileId;
  const config = window.SITE_SUPABASE_CONFIG || {};
  const contentConfig = window.SITE_CONTENT_CONFIG || { gatewayFunction: 'cos-content' };
  const allowedTags = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'A', 'UL', 'OL', 'LI', 'H3', 'SPAN', 'DIV']);

  function safeUrl(value) {
    const url = String(value || '').trim();
    return /^(https?:\/\/|mailto:)/i.test(url) ? url : '';
  }

  function sanitizeHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    const clean = node => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          if (!allowedTags.has(child.tagName)) {
            child.replaceWith(...Array.from(child.childNodes));
            continue;
          }
          const originalHref = child.tagName === 'A' ? child.getAttribute('href') : '';
          const originalClass = child.getAttribute('class') || '';
          for (const attribute of Array.from(child.attributes)) child.removeAttribute(attribute.name);
          if (child.tagName === 'LI' && originalClass.split(/\s+/).includes('academic-item')) child.className = 'academic-item';
          if (child.tagName === 'SPAN' && originalClass.split(/\s+/).includes('academic-year')) child.className = 'academic-year';
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
    if (element && typeof html === 'string' && html.trim()) element.innerHTML = sanitizeHtml(html);
  }

  function renderProfile(profile) {
    setText('profile-name', profile.displayName);
    document.querySelectorAll('[data-profile-name]').forEach(element => {
      if (profile.displayName) element.textContent = profile.displayName;
    });
    const portrait = document.querySelector('.portrait-placeholder');
    if (portrait && profile.initials) portrait.textContent = profile.initials;
    setText('profile-title', profile.title);
    setText('profile-about-heading', profile.aboutHeading);
    setText('profile-research-heading', profile.researchHeading);
    setText('profile-publications-heading', profile.publicationsHeading);
    setText('profile-education-heading', profile.educationHeading);
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
    if (profile.updatedAt) {
      const updated = new Date(profile.updatedAt);
      if (!Number.isNaN(updated.getTime())) setText('profile-updated', `Last updated: ${updated.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    }
    const files = document.getElementById('profile-files');
    const section = document.querySelector('.profile-files-section');
    if (files && section && Array.isArray(profile.files) && profile.files.length) {
      files.innerHTML = '';
      profile.files.forEach(file => {
        const href = safeUrl(file.url);
        if (!href) return;
        const item = document.createElement('li');
        item.className = 'academic-item';
        const type = document.createElement('span');
        type.className = 'academic-year';
        type.textContent = String(file.name || '').split('.').pop()?.toUpperCase() || 'FILE';
        const details = document.createElement('div');
        const link = document.createElement('a');
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = file.name || 'Download document';
        details.appendChild(link);
        item.append(type, details);
        files.appendChild(item);
      });
      section.hidden = !files.children.length;
    }
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
