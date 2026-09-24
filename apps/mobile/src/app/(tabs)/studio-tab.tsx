import { Redirect } from 'expo-router';

/** The studio is a full-screen route; its tab button opens it (see the tabs layout). */
export default function StudioTab() {
  return <Redirect href="/studio" />;
}
