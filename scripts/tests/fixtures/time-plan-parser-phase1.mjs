export const TIME_PLAN_PHASE1_CORPUS = [
  {
    id: 'elapsed-relative-date-clock',
    action: '어제 오전 10시에 1시간 훈련한다',
    context: { currentDate: '1285-03-05', currentTime: '09:00', currentWeekday: '수요일', actorName: '카인', location: '훈련장' },
    expected: {
      types: ['training'],
      committed: [true],
      durations: [[60, 60]],
      starts: [{ date_offset_days: -1, clock_minutes: 600, offset_minutes: -1380, elapsed: true }],
    },
  },
  {
    id: 'relative-day-plus-clock',
    action: '3일 후 오전 10시에 1시간 훈련한다',
    context: { currentDate: '1285-03-05', currentTime: '09:00', currentWeekday: '수요일', actorName: '카인', location: '훈련장' },
    expected: {
      types: ['training'],
      committed: [true],
      durations: [[60, 60]],
      starts: [{ date_offset_days: 3, clock_minutes: 600, offset_minutes: 4380, elapsed: false }],
    },
  },
  {
    id: 'propositive-training',
    action: '1시간 훈련하자',
    context: { currentTime: '09:00', actorName: '카인', location: '훈련장' },
    expected: { types: ['training'], committed: [true], durations: [[60, 60]] },
  },
  {
    id: 'regional-travel-prefix',
    action: '왕도로 가서 1시간 훈련한다',
    context: { currentTime: '09:00', actorName: '카인', location: 'A동 기숙사 개인실' },
    expected: {
      types: ['travel', 'training'],
      committed: [true, true],
      durations: [[15, 60], [60, 60]],
      destinations: ['왕도', null],
      sequence: ['root', 'after_action_1'],
    },
  },
  {
    id: 'compound-actor-separation',
    action: '에밀리가 1시간 훈련하고 나는 8시간 잔다',
    context: { currentTime: '09:00', actorName: '카인', location: '훈련장' },
    expected: {
      types: ['training', 'sleep'],
      actors: ['npc', 'pc'],
      committed: [false, true],
      third_party: [true, false],
      durations: [[60, 60], [480, 480]],
    },
  },
  {
    id: 'quoted-action-not-committed',
    action: '"1시간 훈련한다"고 에밀리가 말했다',
    context: { currentTime: '09:00', actorName: '카인', location: '훈련장' },
    expected: { types: ['training'], actors: ['unknown'], committed: [false], quoted: [true], durations: [[60, 60]] },
  },
  {
    id: 'hypothetical-action-not-committed',
    action: '1시간 훈련할까?',
    context: { currentTime: '09:00', actorName: '카인', location: '훈련장' },
    expected: { types: ['training'], committed: [false], hypothetical: [true], durations: [[60, 60]] },
  },
];
