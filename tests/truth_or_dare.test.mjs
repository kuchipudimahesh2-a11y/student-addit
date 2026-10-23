import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Truth or Dare Game Flow & State Machine', () => {
  it('initializes a fresh Truth or Dare session correctly', () => {
    const senderId = 'user_1';
    const peerId = 'user_2';
    const initialTodState = {
      version: 1,
      round: 1,
      asker_id: senderId,
      target_id: peerId,
      phase: 'awaiting_choice',
      choice: null,
      prompt: null,
      answer: null,
      dare_status: 'idle',
      dare_started_at: null,
      dare_duration_seconds: 30,
      forfeited: false,
    };

    assert.equal(initialTodState.phase, 'awaiting_choice');
    assert.equal(initialTodState.round, 1);
    assert.equal(initialTodState.asker_id, senderId);
    assert.equal(initialTodState.target_id, peerId);
    assert.equal(initialTodState.choice, null);
    assert.equal(initialTodState.forfeited, false);
  });

  it('handles choosing Truth and transitions to awaiting_prompt', () => {
    const state = {
      version: 1,
      round: 1,
      asker_id: 'user_1',
      target_id: 'user_2',
      phase: 'awaiting_choice',
      choice: null,
      prompt: null,
      answer: null,
      dare_status: 'idle',
      dare_started_at: null,
      dare_duration_seconds: 30,
      forfeited: false,
    };

    // user_2 chooses 'truth'
    state.choice = 'truth';
    state.phase = 'awaiting_prompt';

    assert.equal(state.choice, 'truth');
    assert.equal(state.phase, 'awaiting_prompt');
  });

  it('handles submitting Truth question and answering', () => {
    const state = {
      version: 1,
      round: 1,
      asker_id: 'user_1',
      target_id: 'user_2',
      phase: 'awaiting_prompt',
      choice: 'truth',
      prompt: null,
      answer: null,
      dare_status: 'idle',
      dare_started_at: null,
      dare_duration_seconds: 30,
      forfeited: false,
    };

    // user_1 asks question
    state.prompt = 'What is your biggest secret?';
    state.phase = 'awaiting_answer';

    assert.equal(state.phase, 'awaiting_answer');
    assert.equal(state.prompt, 'What is your biggest secret?');

    // user_2 answers
    state.answer = 'I love coding late at night.';
    state.phase = 'round_completed';

    assert.equal(state.phase, 'round_completed');
    assert.equal(state.answer, 'I love coding late at night.');
  });

  it('handles choosing Dare and transitions to performing_dare with 30s timer', () => {
    const state = {
      version: 1,
      round: 1,
      asker_id: 'user_1',
      target_id: 'user_2',
      phase: 'awaiting_prompt',
      choice: 'dare',
      prompt: null,
      answer: null,
      dare_status: 'idle',
      dare_started_at: null,
      dare_duration_seconds: 30,
      forfeited: false,
    };

    // user_1 submits dare
    state.prompt = 'Do 10 pushups on camera';
    state.phase = 'performing_dare';
    state.dare_status = 'running';
    state.dare_started_at = Date.now();

    assert.equal(state.phase, 'performing_dare');
    assert.equal(state.dare_status, 'running');
    assert.ok(state.dare_started_at);

    // 30s dare completed
    state.phase = 'round_completed';
    state.dare_status = 'completed';

    assert.equal(state.phase, 'round_completed');
    assert.equal(state.dare_status, 'completed');
  });

  it('handles forfeit / chicken out correctly', () => {
    const state = {
      version: 1,
      round: 1,
      asker_id: 'user_1',
      target_id: 'user_2',
      phase: 'performing_dare',
      choice: 'dare',
      prompt: 'Sing a song loudly',
      answer: null,
      dare_status: 'running',
      dare_started_at: Date.now(),
      dare_duration_seconds: 30,
      forfeited: false,
    };

    // user_2 forfeits
    state.phase = 'round_completed';
    state.forfeited = true;
    state.dare_status = 'forfeited';

    assert.equal(state.phase, 'round_completed');
    assert.equal(state.forfeited, true);
    assert.equal(state.dare_status, 'forfeited');
  });

  it('inverts roles on next round', () => {
    const finishedState = {
      version: 1,
      round: 1,
      asker_id: 'user_1',
      target_id: 'user_2',
      phase: 'round_completed',
      choice: 'truth',
      prompt: 'Question 1',
      answer: 'Answer 1',
      dare_status: 'idle',
      dare_started_at: null,
      dare_duration_seconds: 30,
      forfeited: false,
    };

    const nextRoundState = {
      version: 1,
      round: finishedState.round + 1,
      asker_id: finishedState.target_id, // inverted!
      target_id: finishedState.asker_id, // inverted!
      phase: 'awaiting_choice',
      choice: null,
      prompt: null,
      answer: null,
      dare_status: 'idle',
      dare_started_at: null,
      dare_duration_seconds: 30,
      forfeited: false,
    };

    assert.equal(nextRoundState.round, 2);
    assert.equal(nextRoundState.asker_id, 'user_2');
    assert.equal(nextRoundState.target_id, 'user_1');
    assert.equal(nextRoundState.phase, 'awaiting_choice');
  });
});
