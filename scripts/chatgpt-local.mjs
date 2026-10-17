#!/usr/bin/env node
import { Entry } from '@napi-rs/keyring';
import { createChatGPTLocalServer } from './chatgpt-local-server.mjs';

const entry = new Entry('MillOS ChatGPT', 'local-plan-session');
const credentialStore = {
  async load() {
    const value = entry.getPassword();
    return value ? JSON.parse(value) : null;
  },
  async save(value) {
    entry.setPassword(JSON.stringify(value));
  },
};

try {
  const companion = createChatGPTLocalServer({ credentialStore });
  const origin = await companion.start();
  console.log(`MillOS with ChatGPT sign-in: ${origin}`);
  console.log('Keep this terminal open while using the local app. Press Ctrl+C to stop.');
} catch (error) {
  console.error(`ChatGPT local companion could not start: ${error.message}`);
  process.exitCode = 1;
}
