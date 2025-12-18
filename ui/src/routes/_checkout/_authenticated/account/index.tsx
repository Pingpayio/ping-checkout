import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_checkout/_authenticated/account/')({
  beforeLoad: () => {
    throw redirect({
      to: '/account/orders',
      replace: true,
    });
  },
});
