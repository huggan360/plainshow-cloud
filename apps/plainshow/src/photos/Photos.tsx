import { PageHead } from '../Shell';
import { Empty } from '../ui';

export default function Photos({ path }: { path: string }) {
    return <div><PageHead title="Photos" /><Empty icon="bx-hard-hat">Coming in this pass ({path}).</Empty></div>;
}
