import girlIcon from './assets/emoji-girl.png'
import boyIcon from './assets/emoji-boy.png'

export const EMPLOYEE_NAMES = ['Carla', 'Anoushka', 'Chloe', 'Medina', 'Parul', 'Nikhil', 'Geet']

export const EMPLOYEE_GENDERS = {
  Carla: 'female',
  Anoushka: 'female',
  Chloe: 'female',
  Medina: 'female',
  Parul: 'female',
  Nikhil: 'male',
  Geet: 'male',
}

export function isMaleEmployee(name) {
  if (!name) return false
  const clean = name.trim().toLowerCase()
  return clean === 'nikhil' || clean === 'geet' || clean.startsWith('nikhil ') || clean.startsWith('geet ')
}

export function getEmployeeEmoji(name) {
  if (!name) return '👤'
  if (name === '__other__' || name === 'other' || name.toLowerCase().includes('other')) return '👤'
  return isMaleEmployee(name) ? '👦' : '👧'
}

export function getEmployeeAvatar(name) {
  if (!name || name === '__other__' || name === 'other' || name === 'none') return null
  return isMaleEmployee(name) ? boyIcon : girlIcon
}
