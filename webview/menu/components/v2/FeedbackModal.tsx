/**
 * FeedbackModal Component
 *
 * Modal for collecting user feedback with:
 * - 5-star rating selector
 * - Optional text feedback
 * - Anonymous submission (no login required)
 */

import { useState } from 'react';
import { X, Star } from 'lucide-react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (rating: number, message?: string) => void;
}

export function FeedbackModal({ isOpen, onClose, onSubmit }: FeedbackModalProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (rating === 0) return;

    onSubmit(rating, message || undefined);

    // Show thank you immediately and close
    setSubmitted(true);
    setTimeout(() => {
      onClose();
      setRating(0);
      setMessage('');
      setSubmitted(false);
    }, 1500);
  };

  const displayRating = hoveredRating || rating;

  return (
    <div className="vl-modal-overlay" onClick={onClose}>
      <div className="vl-modal vl-feedback-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="vl-modal-header">
          <h3>How are we doing?</h3>
          <button className="vl-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="vl-modal-body">
          {submitted ? (
            <div className="vl-feedback-thanks">
              <span className="vl-feedback-thanks-icon">&#x2714;</span>
              <p>Thank you for your feedback!</p>
            </div>
          ) : (
            <>
              <div className="vl-feedback-stars">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoveredRating(star)}
                    onMouseLeave={() => setHoveredRating(0)}
                    className="vl-feedback-star-btn"
                    aria-label={`Rate ${star} star${star === 1 ? '' : 's'}`}
                  >
                    <Star
                      size={28}
                      className={`vl-feedback-star ${star <= displayRating ? 'filled' : ''}`}
                    />
                  </button>
                ))}
              </div>

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="How can we make DevArk better for you?"
                className="vl-feedback-textarea"
                maxLength={2000}
              />

              <button
                onClick={handleSubmit}
                disabled={rating === 0}
                className="vl-btn vl-btn-primary vl-feedback-submit"
              >
                Send Feedback
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default FeedbackModal;
