-- Optional demo members. Safe to run more than once.
INSERT INTO members (full_name, phone, email, ward) VALUES
  ('Asha Kumari', '9000000001', 'asha@example.com', 'Ward 4'),
  ('Ravi Mohan', '9000000002', 'ravi@example.com', 'Ward 7'),
  ('Sreejith Nair', '9000000003', 'sreejith@example.com', 'Ward 11')
ON CONFLICT (phone) DO NOTHING;
