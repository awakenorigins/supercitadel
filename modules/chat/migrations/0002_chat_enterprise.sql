-- chat enterprise upgrade (R11.5) — rooms kind/department, member role,
-- reply/recall, pins, attachments. Idempotent.

-- rooms: loại phòng + gắn phòng ban
ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS kind varchar(20) NOT NULL DEFAULT 'group';
ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS department_id uuid;
UPDATE chat_rooms SET kind = CASE WHEN is_group THEN 'group' ELSE 'direct' END WHERE kind = 'group' AND is_group = false;

-- members: vai trò trong phòng (admin phòng quản lý thành viên/ghim/đổi tên)
ALTER TABLE chat_room_members ADD COLUMN IF NOT EXISTS role varchar(12) NOT NULL DEFAULT 'member';

-- messages: trả lời + thu hồi + loại tin
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_id uuid;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS kind varchar(16) NOT NULL DEFAULT 'text';

-- ghim tin trong phòng
CREATE TABLE IF NOT EXISTS chat_pins (
  room_id     uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  message_id  uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL,
  pinned_by   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, message_id)
);
CREATE INDEX IF NOT EXISTS chat_pins_org_idx ON chat_pins(org_id);

-- file đính kèm (base64 trong DB, giới hạn 5MB — đủ tài liệu văn phòng)
CREATE TABLE IF NOT EXISTS chat_attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL,
  file_name   varchar(200) NOT NULL,
  mime        varchar(120) NOT NULL,
  size_bytes  integer NOT NULL,
  data_b64    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_attachments_msg_idx ON chat_attachments(message_id);
CREATE INDEX IF NOT EXISTS chat_attachments_org_idx ON chat_attachments(org_id);
