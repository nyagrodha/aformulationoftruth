const claimInput = document.getElementById('claimInput');
const result = document.getElementById('result');
const sourceText = document.getElementById('sourceText');
const confidenceMeter = document.getElementById('confidenceMeter');

const sliders = {
  certainty: document.getElementById('certainty'),
  vagueness: document.getElementById('vagueness'),
  bias: document.getElementById('bias'),
  conspiracy: document.getElementById('conspiracy'),
};

const sliderValues = {
  certainty: document.getElementById('certaintyValue'),
  vagueness: document.getElementById('vaguenessValue'),
  bias: document.getElementById('biasValue'),
  conspiracy: document.getElementById('conspiracyValue'),
};

const hedges = ['many people are saying', 'sources close to the situation confirm', 'it is universally known', 'serious thinkers agree'];
const emotions = ['which should outrage everyone', 'and this is honestly inspiring', 'which proves how broken everything is', 'and that is deeply heroic'];
const conspiracies = ['behind closed curtains', 'within a classified spreadsheet', 'inside a private algorithmic cabal', 'through an invisible committee'];
const sources = ['fortune cookie archives', 'parking lot ethnography', 'group chat testimony', 'predictive dream logs'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function mirrorClaim(text) {
  if (!text.trim()) return 'Reality is pending additional rumors.';

  const certainty = Number(sliders.certainty.value);
  const vagueness = Number(sliders.vagueness.value);
  const bias = Number(sliders.bias.value);
  const conspiracy = Number(sliders.conspiracy.value);

  const prefix = certainty > 65 ? 'Undeniably,' : certainty > 35 ? 'Allegedly,' : 'Possibly,';
  const vagueAddon = vagueness > 60 ? 'in ways too complex to explain plainly' : 'in mostly observable ways';
  const biasAddon = bias > 60 ? pick(emotions) : '';
  const conspiracyAddon = conspiracy > 55 ? ` ${pick(conspiracies)}` : '';
  const confidenceValue = Math.min(100, Math.max(0, Math.max(85, certainty + 18)));

  confidenceMeter.textContent = `${confidenceValue}%`;
  sourceText.textContent = pick(sources);

  return `${prefix} ${pick(hedges)} that "${text.trim()}" is true ${vagueAddon}${conspiracyAddon} ${biasAddon}`.replace(/\s+/g, ' ').trim();
}

function contradictClaim(text) {
  const base = text.trim() || 'this statement';
  sourceText.textContent = pick(sources);
  confidenceMeter.textContent = '99%';
  return `Experts now confirm the precise opposite of "${base}", with no further questions accepted.`;
}

Object.entries(sliders).forEach(([key, el]) => {
  el.addEventListener('input', () => {
    sliderValues[key].textContent = el.value;
  });
});

document.getElementById('distortBtn').addEventListener('click', () => {
  result.textContent = mirrorClaim(claimInput.value);
});

document.getElementById('contradictBtn').addEventListener('click', () => {
  result.textContent = contradictClaim(claimInput.value);
});

document.getElementById('presetChips').addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;

  const presets = {
    doomer: { certainty: 70, vagueness: 45, bias: 90, conspiracy: 50 },
    corporate: { certainty: 96, vagueness: 78, bias: 40, conspiracy: 10 },
    uncle: { certainty: 88, vagueness: 52, bias: 76, conspiracy: 95 },
    guru: { certainty: 99, vagueness: 65, bias: 85, conspiracy: 15 },
  };

  const preset = presets[target.dataset.preset];
  if (!preset) return;

  for (const [key, val] of Object.entries(preset)) {
    sliders[key].value = val;
    sliderValues[key].textContent = val;
  }
});
