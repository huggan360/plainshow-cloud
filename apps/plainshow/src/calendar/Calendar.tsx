import { PageHead } from '../Shell';
import { Empty } from '../ui';

export default function Calendar({ path }: { path: string }) {
    return <div><PageHead title="Calendar" /><Empty icon="bx-hard-hat">Coming in this pass ({path}).</Empty></div>;
}
