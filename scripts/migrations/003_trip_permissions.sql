-- Trip permissions table for organization-wide sharing

CREATE TABLE IF NOT EXISTS trip_permissions (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(trip_id, organization_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_trip_permissions_trip_id ON trip_permissions(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_permissions_organization_id ON trip_permissions(organization_id);
