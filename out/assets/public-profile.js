(function () {
  'use strict';

  const profileId = document.body.dataset.profileId;
  const config = window.SITE_SUPABASE_CONFIG || {};
  const contentConfig = window.SITE_CONTENT_CONFIG || { gatewayFunction: 'cos-content' };
  const { safeUrl, safeImageUrl, sanitizeHtml } = window.ProfileContent;

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element && typeof value === 'string' && value.trim()) element.textContent = value;
  }

  function renderRichList(id, html) {
    const element = document.getElementById(id);
    if (element && typeof html === 'string') element.innerHTML = window.ProfileContent.cleanLegacy(/^\s*<li\b/i.test(html) ? `<ul class="academic-list">${html}</ul>` : html);
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
    renderRichList('profile-education', window.ProfileContent.experienceTable(profile.educationHtml || ''));
    renderRichList('profile-teaching', window.ProfileContent.experienceTable(profile.teachingHtml || ''));
    const textFields = {
      displayName: 'profile-name', title: 'profile-title', location: 'profile-location', email: 'profile-email',
      aboutHeading: 'profile-about-heading', researchHeading: 'profile-research-heading',
      publicationsHeading: 'profile-publications-heading', educationHeading: 'profile-education-heading',
      teachingHeading: 'profile-teaching-heading'
    };
    for (const [field, id] of Object.entries(textFields)) {
      const target = document.getElementById(id);
      const formatted = document.createElement('div');
      formatted.innerHTML = sanitizeHtml(profile.textFormats?.[field] || '');
      if (!target || !formatted.innerHTML || formatted.textContent.trim() !== String(profile[field] || '').trim()) continue;
      target.innerHTML = formatted.innerHTML;
      if (field === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
        const link = document.createElement('a');
        link.href = `mailto:${profile.email}`;
        link.append(...target.childNodes);
        target.append(link);
      }
    }
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

