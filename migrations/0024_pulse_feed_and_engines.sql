-- Migration 0024: Pulse Feed & 4 Continuous Content Engines
PRAGMA foreign_keys = ON;

-- 1. Pulse Posts (Core feed items from users, syndicated feeds, personas, and prompt responses)
CREATE TABLE IF NOT EXISTS pulse_posts (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_handle TEXT NOT NULL,
  is_anonymous INTEGER NOT NULL DEFAULT 1,
  channel TEXT NOT NULL DEFAULT 'confessions', -- 'confessions', 'hot_takes', 'real_talk', 'midnight'
  title TEXT,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  card_theme TEXT NOT NULL DEFAULT 'paper', -- 'paper', 'velvet', 'terracotta', 'sage'
  source TEXT NOT NULL DEFAULT 'user', -- 'user', 'prompt_response', 'anonymous_ask', 'syndicated', 'persona'
  poll_question TEXT,
  poll_option_a TEXT,
  poll_option_b TEXT,
  prompt_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS pulse_posts_channel_created_idx ON pulse_posts(channel, created_at DESC);
CREATE INDEX IF NOT EXISTS pulse_posts_created_idx ON pulse_posts(created_at DESC);

-- 2. Expressive Reactions (5 custom emotions: fire, skull, popcorn, brain, heartbreak)
CREATE TABLE IF NOT EXISTS pulse_reactions (
  post_id TEXT NOT NULL REFERENCES pulse_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('fire', 'skull', 'popcorn', 'brain', 'heartbreak')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id, reaction_type)
);

CREATE INDEX IF NOT EXISTS pulse_reactions_post_idx ON pulse_reactions(post_id);

-- 3. Comments Thread (with dual identity: handle or anonymous)
CREATE TABLE IF NOT EXISTS pulse_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES pulse_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_handle TEXT NOT NULL,
  is_anonymous INTEGER NOT NULL DEFAULT 1,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS pulse_comments_post_idx ON pulse_comments(post_id, created_at ASC);

-- 4. Interactive Mini-Poll Votes
CREATE TABLE IF NOT EXISTS pulse_poll_votes (
  post_id TEXT NOT NULL REFERENCES pulse_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  choice TEXT NOT NULL CHECK (choice IN ('a', 'b')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id)
);

-- 5. Engine 3: Fill-in-the-Blank Prompts Multiplier
CREATE TABLE IF NOT EXISTS pulse_prompts (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL DEFAULT 'all',
  prompt_text TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Engine 4: Anonymous Asks & Confessions (NGL style)
CREATE TABLE IF NOT EXISTS anonymous_asks (
  id TEXT PRIMARY KEY,
  recipient_username TEXT NOT NULL COLLATE NOCASE,
  sender_hash TEXT,
  question TEXT NOT NULL CHECK (length(question) BETWEEN 1 AND 1000),
  reply TEXT,
  is_published_to_feed INTEGER NOT NULL DEFAULT 0,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS anonymous_asks_recipient_idx ON anonymous_asks(recipient_username, created_at DESC);

-- SEED DATA: High-engagement starter content across all channels so Day 1 is lively!
INSERT OR IGNORE INTO pulse_prompts (id, channel, prompt_text) VALUES
('pr-1', 'real_talk', 'The hardest truth about adulting that nobody prepared us for is:'),
('pr-2', 'confessions', 'Something I feel guilty about but will never admit in person:'),
('pr-3', 'hot_takes', 'An unwritten social rule that actually makes zero sense:'),
('pr-4', 'real_talk', 'One skill that actually increased my salary more than my degree:'),
('pr-5', 'midnight', 'What is keeping you awake at 2 AM tonight?');

-- Starter posts: Personas & Seed conversations
INSERT OR IGNORE INTO pulse_posts (id, author_handle, is_anonymous, channel, title, body, card_theme, source, poll_question, poll_option_a, poll_option_b, created_at) VALUES
('post-s1', 'TheCorporateSurvivor', 0, 'real_talk', 'The 40-Year Trap', 'Most people spend their early 20s thinking they have to figure everything out by 25. Reality check: 80% of senior managers I work with are making it up as they go. Don''t panic if your career path looks like spaghetti right now.', 'paper', 'persona', 'Do you feel on track for your age?', 'Yes, moving forward', 'No, winging it entirely', datetime('now', '-2 hours')),

('post-s2', 'Anonymous 🎭', 1, 'confessions', 'The Silent Promotion', 'I was promoted to lead our engineering squad last month. Everyone thinks I know all the architecture secrets. I literally ask Claude and ChatGPT to review every single PR before I approve it.', 'velvet', 'user', NULL, NULL, NULL, datetime('now', '-4 hours')),

('post-s3', 'CampusGhost', 0, 'hot_takes', 'Unpopular College Take', 'Attending 90% of college lectures is an inefficient way to learn. The best developers and creatives in our batch spent lecture hours in the corner working on real projects and side businesses.', 'terracotta', 'persona', 'Is attendance criteria outdated?', 'Abolish it', 'Keep it necessary', datetime('now', '-6 hours')),

('post-s4', 'MidnightOwl', 0, 'midnight', '3 AM Thoughts', 'There are people who knew you 3 years ago who think you are still the same version of you. Let them be wrong in peace. You don''t owe anyone an explanation for outgrowing old spaces.', 'sage', 'persona', NULL, NULL, NULL, datetime('now', '-9 hours')),

('post-s5', 'Anonymous 🎭', 1, 'confessions', 'Secret from Hostel 4', 'To whoever made Maggi at 2:30 AM in the second floor pantry and left half a packet of seasoning on the shelf: you saved my night during midterms. You will never know, but thank you.', 'paper', 'user', NULL, NULL, NULL, datetime('now', '-12 hours')),

('post-s6', 'ThePhilosopher', 0, 'hot_takes', 'Modern Friendships', 'We have 800 followers on Instagram and 500 contacts on WhatsApp, but if our car broke down at 2 AM on a highway, most of us only have 1 or 2 people we could actually call without feeling awkward.', 'velvet', 'persona', 'How many 2 AM emergency friends do you have?', '3 or more', '1 or 2 at most', datetime('now', '-18 hours')),

('post-s7', 'Anonymous 🎭', 1, 'real_talk', 'First Job Reality Check', 'First month salary hit my bank account yesterday. Seeing tax deductions and rent take 60% immediately was the most humbling experience of my entire life. Is this what freedom is?', 'terracotta', 'user', NULL, NULL, NULL, datetime('now', '-22 hours'));
