import { View, Pressable, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors } from "@/theme/colors";

interface StarRatingProps {
  value: number | null;
  onChange?: (value: number) => void;
  size?: number;
  readOnly?: boolean;
  color?: string;
}

/**
 * Five-star input/display. When onChange is provided (and readOnly isn't
 * true), tapping a star sets the rating. Otherwise it's just a read-only
 * display — used both in the review composer and in review cards/badges.
 */
export function StarRating({ value, onChange, size = 22, readOnly = false, color }: StarRatingProps) {
  const stars = [1, 2, 3, 4, 5];
  const filled = value ?? 0;
  const filledColor = color ?? colors.accentReward;

  return (
    <View style={styles.row}>
      {stars.map((star) => {
        const isFilled = star <= filled;
        const StarWrapper = readOnly || !onChange ? View : Pressable;
        return (
          <StarWrapper key={star} onPress={onChange ? () => onChange(star) : undefined}>
            <MaterialCommunityIcons
              name={isFilled ? "star" : "star-outline"}
              size={size}
              color={isFilled ? filledColor : colors.textDisabled}
              style={styles.star}
            />
          </StarWrapper>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  star: { marginRight: 2 },
});