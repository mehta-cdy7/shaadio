type Couple = {
  brideName: string;
  groomName: string;
  nameOrder?: 'BRIDE_FIRST' | 'GROOM_FIRST';
};

/**
 * The couple's names in the order they chose (PRD §9.2): bride first unless the wedding says
 * otherwise. Every place that shows both names together goes through this.
 */
export function coupleNames({ brideName, groomName, nameOrder = 'BRIDE_FIRST' }: Couple) {
  return nameOrder === 'GROOM_FIRST'
    ? ([groomName, brideName] as const)
    : ([brideName, groomName] as const);
}
