// Shared state for the mocked ETH/USD feed (see setup.ts).
export const priceState = { value: 2000, calls: 0 };

export function resetPrice(value = 2000) {
  priceState.value = value;
  priceState.calls = 0;
}
