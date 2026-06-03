import fetch from 'node-fetch';
const token = 'vca_42WFwYddbLybcZEYiefZBiTAHu59rTqwswG1RzR4aAfnYF52yf1wt5GH';
const urls = [
  'https://api.vercel.com/v2/user',
  'https://api.vercel.com/v1/projects/prj_iMo5IQ68RdjsRGItYbSpYxExSVe3',
];
(async () => {
  for (const url of urls) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    console.log('URL', url, 'STATUS', res.status);
    console.log(await res.text());
  }
})();
