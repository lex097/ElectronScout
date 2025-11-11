export type UserRole = 'scouter' | 'administrator';

export interface User {
  id: string;
  name: string;
  teamNumber: string;
  role: UserRole;
}

