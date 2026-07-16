import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FAQ } from '@/components/landing/faq';

vi.mock('framer-motion');

const QUESTION_1 = 'SocialFlow est-il conforme à la législation sociale belge ?';
const ANSWER_1 = /Les calculs de cotisations ONSS/;
const QUESTION_2 = 'Mes données sont-elles hébergées en Europe ?';
const ANSWER_2 = /l'ensemble des données est hébergé/;

describe('FAQ', () => {
  it('affiche les questions sans révéler les réponses par défaut', () => {
    render(<FAQ />);

    expect(screen.getByText(QUESTION_1)).toBeInTheDocument();
    expect(screen.queryByText(ANSWER_1)).not.toBeInTheDocument();
  });

  it('révèle la réponse au clic sur une question', () => {
    render(<FAQ />);

    fireEvent.click(screen.getByText(QUESTION_1));

    expect(screen.getByText(ANSWER_1)).toBeInTheDocument();
  });

  it('referme la réponse sur un second clic', () => {
    render(<FAQ />);
    const question = screen.getByText(QUESTION_1);

    fireEvent.click(question);
    expect(screen.getByText(ANSWER_1)).toBeInTheDocument();

    fireEvent.click(question);
    expect(screen.queryByText(ANSWER_1)).not.toBeInTheDocument();
  });

  it("ne garde qu'une seule réponse ouverte à la fois", () => {
    render(<FAQ />);

    fireEvent.click(screen.getByText(QUESTION_1));
    expect(screen.getByText(ANSWER_1)).toBeInTheDocument();

    fireEvent.click(screen.getByText(QUESTION_2));

    expect(screen.queryByText(ANSWER_1)).not.toBeInTheDocument();
    expect(screen.getByText(ANSWER_2)).toBeInTheDocument();
  });
});
