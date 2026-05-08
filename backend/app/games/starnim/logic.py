import random


class Starnim:
    def __init__(self, node_states=None, ordered_states=None, grundy=None):
        if node_states is None and ordered_states is None:
            raise ValueError("You must provide either node_states or ordered_states.")
        if node_states is not None and ordered_states is not None:
            raise ValueError("You can't provide both node_states and ordered_states.")
        if ordered_states is not None:
            self.ordered_states = ordered_states
            self.node_states = self.get_original_order()
        if node_states is not None:
            self.node_states = node_states
            self.ordered_states = self.get_ordered_states()

        self.grundy = grundy if grundy is not None else self.calculate_grundy()

    def calculate_grundy(self):
        grundy = [0, 1, 2]
        node_count = len(self.node_states)

        for index in range(3, node_count):
            possible_moves = [
                grundy[k] ^ grundy[index - k - 1] for k in range(index // 2 + 1)
            ] + [
                grundy[k] ^ grundy[index - k - 2] for k in range(index // 2 + 1)
            ]
            grundy.append(Starnim.mex(possible_moves))

        return grundy

    def get_ordered_states(self):
        node_count = len(self.node_states)
        new_order = [0]

        for _ in range(node_count - 1):
            new_order.append((new_order[-1] + node_count // 2) % node_count)

        return [self.node_states[index] for index in new_order]

    def get_original_order(self):
        node_count = len(self.ordered_states)
        original_states = [None] * node_count
        next_node = 0
        jump = node_count // 2

        for index in range(node_count):
            original_states[next_node] = self.ordered_states[index]
            next_node = (next_node + jump) % node_count

        return original_states

    @property
    def pile_dict(self):
        pile_dict = {}
        running_indices = []

        for index, node in enumerate(self.ordered_states):
            if not node:
                running_indices.append(index)
            else:
                if running_indices:
                    pile_dict[len(pile_dict)] = running_indices
                    running_indices = []

        if running_indices:
            if not self.ordered_states[0]:
                pile_dict[0] = running_indices + pile_dict.get(0, [])
            else:
                pile_dict[len(pile_dict)] = running_indices

        return pile_dict

    def play(self, nodes):
        if len(nodes) > 2:
            raise ValueError(f"Too many nodes. Expected 1 or 2, got {len(nodes)}.")

        if len(nodes) == 2:
            if not any(nodes[0] in pile and nodes[1] in pile for pile in self.pile_dict.values()):
                raise ValueError("The nodes are not connected.")

        if self.ordered_states[nodes[0]]:
            raise ValueError("The first node is already taken.")

        self.ordered_states[nodes[0]] = True

        if len(nodes) == 2:
            if self.ordered_states[nodes[1]]:
                raise ValueError("The second node is already taken.")
            self.ordered_states[nodes[1]] = True

        self.node_states = self.get_original_order()

    def is_full(self):
        return not any(self.node_states)

    def nimber(self):
        out = 0
        for pile in self.pile_dict.values():
            out ^= self.grundy[len(pile)]
        return out

    @staticmethod
    def mex(numbers):
        number_set = set(numbers)
        for index in range(len(number_set) + 1):
            if index not in number_set:
                return index
        return len(number_set)

    def is_safe(self):
        if self.is_full():
            return True

        return self.nimber() == 0

    def valid_moves(self):
        moves = []
        for pile in self.pile_dict.values():
            if len(pile) == 1:
                moves.append((pile[0],))
            else:
                moves.append((pile[0],))
                for index in range(1, len(pile)):
                    moves.append((pile[index],))
                    moves.append((pile[index - 1], pile[index]))

        return moves

    def find_safe_moves(self):
        if self.is_safe():
            raise ValueError("Game is already safe.")

        safe_moves = []
        for move in self.valid_moves():
            new_game = Starnim(node_states=self.node_states.copy(), grundy=self.grundy.copy())
            new_game.play(move)
            if new_game.is_safe():
                safe_moves.append(move)

        if not safe_moves:
            raise ValueError("No safe moves found.")

        return safe_moves

    def find_unsafe_moves(self):
        if not self.is_safe():
            raise ValueError("Game is already unsafe.")

        return self.valid_moves()

    def next_move_node(self, error_probability=0):
        if random.random() < error_probability:
            ordered_move = random.choice(self.valid_moves())
        elif self.is_safe():
            ordered_move = random.choice(self.find_unsafe_moves())
        else:
            ordered_move = random.choice(self.find_safe_moves())

        return [self.ordered_node_to_normal_node(node) for node in ordered_move]

    def ordered_node_to_normal_node(self, ordered_node):
        return (ordered_node * (len(self.node_states) // 2)) % len(self.node_states)
