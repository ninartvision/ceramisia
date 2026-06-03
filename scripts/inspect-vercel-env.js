import fetch from 'node-fetch';

const token = 'vca_42WFwYddbLybcZEYiefZBiTAHu59rTqwswG1RzR4aAfnYF52yf1wt5GH';
const projectId = 'prj_iMo5IQ68RdjsRGItYbSpYxExSVe3';
const endpoints = [
  `https://api.vercel.com/v9/projects/${projectId}/env?target=production`,
  `https://api.vercel.com/v9/projects/${projectId}/env?target=production&decrypt=true`,
  `https://api.vercel.com/v1/projects/${projectId}/env?target=production`,
  `https://api.vercel.com/v1/projects/${projectId}/env?target=production&decrypt=true`,
];

(async () => {
  for (const url of endpoints) {
    console.log('---', url);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    console.log('STATUS', res.status);
    const text = await res.text();
    console.log(text.slice(0, 2000));
    console.log('---');
  }
})();
