// db can be the pool or a transaction client
async function logActivity(db, { projectId, userId, action, entityType, entityId, metadata = {} }) {
  await db.query(
    `INSERT INTO activity_logs (project_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [projectId, userId, action, entityType, entityId, JSON.stringify(metadata)]
  );
}

module.exports = { logActivity };