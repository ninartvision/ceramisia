import fetch from 'node-fetch';

const token = 'vca_42WFwYddbLybcZEYiefZBiTAHu59rTqwswG1RzR4aAfnYF52yf1wt5GH';
const projectId = 'prj_iMo5IQ68RdjsRGItYbSpYxExSVe3';
const ids = ['byA2UzUNjUuCkZTu', 'RxW3b3ETNeVnz7gD'];

(async () => {
  for (const id of ids) {
    const res = await fetch(`https://api.vercel.com/v1/projects/${projectId}/env/${id}?decrypt=true`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    console.log('ID', id, 'STATUS', res.status);
    console.log(await res.text());
  }
})();
