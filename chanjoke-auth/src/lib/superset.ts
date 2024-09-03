import fetch from "cross-fetch";

let SUPERSET_USERNAME = String(process.env.SUPERSET_USERNAME);
let SUPERSET_PASSWORD = String(process.env.SUPERSET_PASSWORD);
let DASHBOARD_ID = String(process.env.DASHBOARD_ID);
let SUPERSET_URL = String(process.env.SUPERSET_URL);

let GUEST_USERNAME = String(process.env.GUEST_USERNAME);
let GUEST_FIRST_NAME = String(process.env.GUEST_FIRST_NAME);
let GUEST_LAST_NAME = String(process.env.GUEST_LAST_NAME);

export const getSupersetGuestToken = async () => {
  let response = await fetch(`${SUPERSET_URL}/api/v1/security/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: SUPERSET_USERNAME,
      password: SUPERSET_PASSWORD,
      provider: "db",
      refresh: true,
    }),
  });

  //   get the guest token
  const data = await response.json();

  const guestResponse = await fetch(`${SUPERSET_URL}/api/v1/security/guest_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.access_token}`,
    },
    body: JSON.stringify({
      resources: [
        {
          id: DASHBOARD_ID,
          type: "dashboard",
        },
      ],
      user: {
        first_name: GUEST_FIRST_NAME,
        last_name: GUEST_LAST_NAME,
        username: GUEST_USERNAME,
      },
      rls: [],
    }),
  });

  const guestData = await guestResponse.json();

  return guestData.token;
};
