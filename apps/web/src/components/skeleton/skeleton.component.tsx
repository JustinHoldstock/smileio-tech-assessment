import styles from './skeleton.module.css';

interface SkeletonParams {
  width?: string;
  height?: string;
  radius?: string;
}

/**
 * A placeholder block sized to whatever it stands in for.
 *
 * `aria-hidden` throughout: the container that owns the skeletons carries the
 * `aria-busy` / loading announcement, so exposing each shape individually would
 * just spam a screen reader with meaningless nodes.
 */
export const Skeleton = ({
  width = '100%',
  height = '1rem',
  radius = '6px'
}: SkeletonParams) => (
  <span
    className={styles.skeleton}
    style={{ width, height, borderRadius: radius }}
    aria-hidden="true"
  />
);
