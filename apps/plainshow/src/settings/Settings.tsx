import { PageHead } from '../Shell';
import { Empty } from '../ui';

export default function Settings({ path }: { path: string }) {
    return <div><PageHead title="Settings" /><Empty icon="bx-hard-hat">Coming in this pass ({path}).</Empty></div>;
}
