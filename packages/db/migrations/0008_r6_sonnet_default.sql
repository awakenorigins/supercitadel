-- R6: Sonnet 4.6 default engine for Tiểu Tâm
ALTER TABLE tt_soul_state ALTER COLUMN engine SET DEFAULT 'sonnet-4.6';
UPDATE tt_soul_state SET engine = 'sonnet-4.6' WHERE engine IN ('stub-a','stub-b');
