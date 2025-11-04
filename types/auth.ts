export type UserRole = 'scouter' | 'administrator';

export interface User {
  id: string;
  username: string;
  role: UserRole;
}

