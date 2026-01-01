-- Add user-specific trip sharing support

-- Add user_id column and make organization_id nullable
ALTER TABLE trip_permissions
  ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  ALTER COLUMN organization_id DROP NOT NULL;

-- Add check constraint: either organization_id OR user_id must be set (not both NULL)
ALTER TABLE trip_permissions
  ADD CONSTRAINT check_permission_type
  CHECK (
    (organization_id IS NOT NULL AND user_id IS NULL) OR
    (organization_id IS NULL AND user_id IS NOT NULL)
  );

-- Drop old unique constraint if it exists
ALTER TABLE trip_permissions
  DROP CONSTRAINT IF EXISTS trip_permissions_trip_id_organization_id_key;

-- Add unique constraints for both permission types
CREATE UNIQUE INDEX IF NOT EXISTS trip_permissions_organization_unique
  ON trip_permissions(trip_id, organization_id)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS trip_permissions_user_unique
  ON trip_permissions(trip_id, user_id)
  WHERE user_id IS NOT NULL;

-- Create index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_trip_permissions_user_id ON trip_permissions(user_id);
