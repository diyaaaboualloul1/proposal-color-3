#!/usr/bin/env node
/**
 * SRS Platform — Quick Project Seed Script
 * Usage: node seed-project.js
 *
 * Creates a project + fills questionnaire + submits it (triggers SRS generation)
 */

const http = require('http');

// ─── CONFIG ───────────────────────────────────────────────────
const API = 'http://127.0.0.1:6001/api';
const EMAIL    = 'diyaa@5ostudios.com';
const PASSWORD = 'Admin2026!';

// ─── PROJECT TO CREATE ────────────────────────────────────────
const PROJECT = {
  name:         'Demo Business Website',
  client_name:  'Acme Co.',
  client_contact: 'contact@acmeco.com',
  description:  'A small, clean 5-page business website with a contact form.',
};

// ─── QUESTIONNAIRE ANSWERS ────────────────────────────────────
const ANSWERS = {
  project_type:   'Web App',
  industry:       'Technology',
  target_users:   'Small business owners and potential clients looking to learn about the company and get in touch.',
  core_features:  'Home page with hero section, About us page, Services page, Portfolio/showcase section, Contact form with email notification',
  tech_preferences: 'React, Node.js, PostgreSQL',
  integrations:   'Email service for contact form (Nodemailer or SendGrid)',
  non_functional: 'Mobile responsive, fast load time under 2 seconds, SEO optimized, clean modern UI',
  deployment:     'Cloud',
  existing_systems: 'None',
  timeline:       '4 weeks',
  budget_range:   '$5,000 - $10,000',
  special_requirements: 'Simple and clean design. Minimal pages. No user authentication needed. Easy to maintain.',
};
// ──────────────────────────────────────────────────────────────

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1',
      port: 6001,
      path: `/api${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const r = http.request(opts, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  console.log('\n🚀 SRS Platform — Project Seed\n');

  // 1. Login
  console.log('1️⃣  Logging in...');
  const login = await req('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  if (!login.body.token) {
    console.error('❌ Login failed:', login.body);
    process.exit(1);
  }
  const token = login.body.token;
  console.log(`   ✅ Logged in as ${EMAIL}\n`);

  // 2. Create project
  console.log('2️⃣  Creating project...');
  const create = await req('POST', '/projects', PROJECT, token);
  if (create.status !== 201 && create.status !== 200) {
    console.error('❌ Create project failed:', create.body);
    process.exit(1);
  }
  const project = create.body.project || create.body;
  console.log(`   ✅ Project created: "${project.name}" (ID: ${project.id})\n`);

  // 3. Save questionnaire answers
  console.log('3️⃣  Saving questionnaire answers...');
  const save = await req('PUT', `/projects/${project.id}/questionnaire`, { answers: ANSWERS }, token);
  if (save.status !== 200) {
    console.error('❌ Save questionnaire failed:', save.body);
    process.exit(1);
  }
  console.log('   ✅ Answers saved\n');

  // 4. Submit questionnaire (triggers SRS generation)
  console.log('4️⃣  Submitting questionnaire → triggers AI SRS generation...');
  const submit = await req('POST', `/projects/${project.id}/questionnaire/submit`, {}, token);
  if (submit.status !== 200) {
    console.error('❌ Submit failed:', submit.body);
    process.exit(1);
  }
  console.log('   ✅ Submitted!\n');

  console.log('─'.repeat(50));
  console.log(`✅ Done! Project "${project.name}" is live.`);
  console.log(`🌐 Open: http://142.132.189.59:6060/projects/${project.id}`);
  console.log(`📄 SRS generation started — check the SRS tab in ~30 seconds.`);
  console.log('─'.repeat(50) + '\n');
}

main().catch(err => {
  console.error('💥 Unexpected error:', err.message);
  process.exit(1);
});
