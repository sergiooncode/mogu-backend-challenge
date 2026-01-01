-- Add permission levels (read/write) and trip ownership

-- Add created_by_user_id to trips to track owner
ALTER TABLE trips
  ADD COLUMN created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Add permission_level to trip_permissions
ALTER TABLE trip_permissions
  ADD COLUMN permission_level VARCHAR(10) NOT NULL DEFAULT 'read'
  CHECK (permission_level IN ('read', 'write'));

-- Create index for created_by lookups
CREATE INDEX IF NOT EXISTS idx_trips_created_by_user_id ON trips(created_by_user_id);
