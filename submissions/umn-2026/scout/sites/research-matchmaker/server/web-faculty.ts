import type { Professor } from '../shared/types';

// Cloud preview deliberately uses only the curated catalog. It has no live
// provider, credentials, remote search, or process-local faculty registry.
export function getVerifiedWebProfessor(_id: string): Professor | undefined {
  return undefined;
}
export function webFacultyMatchesSchool(_id: string, _school: string): boolean {
  return false;
}
