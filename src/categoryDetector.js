function detectCategory(text) {
  const lowerText = text.toLowerCase()

  const categoryKeywords = {
    Customer: [
      'customer',
      'client',
      'installation',
      'pickup',
      'pick up',
      'order',
      'called',
      'calling',
    ],

    Stock: [
      'stock',
      'inventory',
      'soil',
      'pot',
      'pots',
      'supply',
      'supplies',
      'sold out',
      'running low',
    ],

    'Plant Care': [
      'water',
      'watering',
      'monstera',
      'plant',
      'plants',
      'leaf',
      'leaves',
      'repot',
      'repotting',
      'fertilizer',
    ],

    Workshop: [
      'workshop',
      'class',
      'event',
      'attendees',
      'materials',
    ],

    Task: [
      'task',
      'finish',
      'complete',
      'do this',
      'need to do',
      'remember to',
    ],
  }

  const scores = {}

  for (const [category, keywords] of Object.entries(
    categoryKeywords
  )) {
    scores[category] = 0

    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        scores[category] += 1
      }
    }
  }

  let bestCategory = 'General'
  let bestScore = 0

  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestCategory = category
      bestScore = score
    }
  }

  return bestCategory
}

export default detectCategory