-- chat module migration — messaging tables (tenant-scoped).
CREATE TABLE IF NOT EXISTS chat_rooms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  name            varchar(120),
  is_group        boolean NOT NULL DEFAULT false,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz
);
CREATE INDEX IF NOT EXISTS chat_rooms_org_idx ON chat_rooms(org_id);

CREATE TABLE IF NOT EXISTS chat_room_members (
  room_id      uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL,
  org_id       uuid NOT NULL,
  last_read_at timestamptz,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS chat_members_user_idx ON chat_room_members(user_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL,
  sender_id   uuid NOT NULL,
  body        text NOT NULL,
  edited_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_messages_room_idx ON chat_messages(room_id, created_at);
CREATE INDEX IF NOT EXISTS chat_messages_org_idx ON chat_messages(org_id);

CREATE TABLE IF NOT EXISTS chat_reactions (
  message_id  uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  emoji       varchar(16) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);
