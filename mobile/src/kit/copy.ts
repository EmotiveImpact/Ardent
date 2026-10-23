/**
 * The words on Ardent's buttons and moments, so both apps say the same thing.
 * Short, plain and British, the way a tradesperson talks. No exclamation
 * marks, no software jargon.
 */
export const copy = {
  setOff: 'Set off',
  arrived: 'Arrived',
  pause: 'Pause',
  resume: 'Back on it',
  onTheTools: 'On the tools',
  holdToFinish: 'Hold to finish job',
  couldntGetIn: "Couldn't get in?",
  getSignOff: 'Get sign-off',
  handItOver: 'Hand it over',
  takePayment: 'Take payment',
  sendInvoice: 'Send invoice',
  newJob: 'New job',
  bookIt: 'Book it',
  saved: 'Saved',
  waitingToSend: (n: number) => (n === 1 ? '1 change waiting for signal' : `${n} changes waiting for signal`),
  allSent: 'All sent',
  signIn: 'Sign in',
  signOut: 'Sign out',
} as const
