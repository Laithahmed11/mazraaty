import {createFileRoute} from '@tanstack/react-router';
import {LegalPage} from '@/components/legal-page';
export const Route=createFileRoute('/delete-account')({component:()=> <LegalPage kind="delete"/>});
