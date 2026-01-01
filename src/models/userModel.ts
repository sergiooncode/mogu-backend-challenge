import { executeQuery } from '../db'
import { User } from '../schemas/user'

async function findByEmail(email: string): Promise<User | undefined> {
  const query = 'SELECT * FROM users WHERE email = $1'
  const result = await executeQuery<User>(query, [email])
  return result.rows[0]
}

export default {
  findByEmail,
}
